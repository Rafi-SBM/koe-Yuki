"""One bounded retry loop for Groq; never replay an already-emitted response."""
import asyncio
import os
import json
import logging
import httpx
import openai
from retry_policy import retry_seconds
from livekit.agents import llm, APIConnectOptions, APIError, APIStatusError
from livekit.plugins import groq
from key_pool import get_global_key_pool, PoolUnavailable
from shared_store import provider_budget, settle_provider_budget, shared_key_cooldown, mark_shared_key_cooldown

def retryable(error):
    status = getattr(error, 'status_code', None)
    return status in (401, 403, 429) or status is not None and status >= 500 or isinstance(error, (httpx.TransportError, TimeoutError)) or getattr(error, 'retryable', False)

async def failed_key(pool, key, error):
    status = getattr(error, 'status_code', None)
    if status in (401, 403):
        pool.mark_invalid(key)
        await mark_shared_key_cooldown(key, 3600)
    elif status == 429:
        pool.mark_rate_limited(key)
        await mark_shared_key_cooldown(key, 60)
    elif retryable(error): pool.mark_error(key)

async def next_key(pool):
    for _ in range(pool.total_keys):
        key = pool.get_api_key()
        if not await shared_key_cooldown(key): return key
        pool.mark_rate_limited(key)
    raise PoolUnavailable('Provider credentials are cooling down')

class PooledGroqLLM(llm.LLM):
    def __init__(self, pool=None):
        super().__init__()
        self.pool = pool or get_global_key_pool()
        self.engines = {}
        self.clients = {}
    @property
    def model(self): return os.getenv('GROQ_LLM_MODEL', 'openai/gpt-oss-120b')
    @property
    def provider(self): return 'groq'
    def chat(self, *, chat_ctx, tools=None, conn_options=None, **kwargs):
        return PooledStream(self, chat_ctx=chat_ctx, tools=tools or [], conn_options=APIConnectOptions(max_retry=0, timeout=20), options=kwargs)
    def engine(self, key):
        if key not in self.engines:
            async def response_hook(response):
                if response.status_code == 429:
                    seconds = retry_seconds(response.headers)
                    self.pool.mark_rate_limited(key, seconds)
                    await mark_shared_key_cooldown(key, int(seconds))
            transport = httpx.AsyncClient(timeout=8.0, event_hooks={"response": [response_hook]})
            client = openai.AsyncClient(api_key=key, base_url="https://api.groq.com/openai/v1", max_retries=0, http_client=transport)
            self.clients[key] = client
            self.engines[key] = groq.LLM(client=client, model=self.model, api_key=key, temperature=0.6, max_completion_tokens=256, reasoning_effort='low', timeout=httpx.Timeout(8.0), max_retries=0)
        return self.engines[key]
    async def aclose(self):
        await super().aclose()
        for engine in self.engines.values(): await engine.aclose()
        for client in self.clients.values(): await client.close()

class PooledStream(llm.LLMStream):
    def __init__(self, *args, options, **kwargs):
        self.options = options
        super().__init__(*args, **kwargs)
    async def _run(self):
        emitted = False
        try:
            async with asyncio.timeout(20):
                for attempt in range(min(3, self._llm.pool.total_keys)):
                    key = await next_key(self._llm.pool)
                    # Conservative UTF-8 bound includes tools and the completion ceiling.
                    schemas = [llm.utils.build_legacy_openai_schema(tool) for tool in self._tools]
                    messages, _ = self._chat_ctx.to_provider_format('openai')
                    estimate = len(json.dumps(messages, ensure_ascii=False).encode('utf8')) + len(json.dumps(schemas, ensure_ascii=False).encode('utf8')) + 512
                    reservation = await provider_budget(self._llm.model, estimate)
                    usage = None
                    try:
                        async with self._llm.engine(key).chat(chat_ctx=self._chat_ctx, tools=self._tools, conn_options=APIConnectOptions(max_retry=0, timeout=8), **self.options) as stream:
                            async for chunk in stream:
                                if chunk.usage is not None: usage = chunk.usage
                                emitted = True
                                self._event_ch.send_nowait(chunk)
                        if usage is not None: await settle_provider_budget(reservation, usage.total_tokens)
                        return
                    except Exception as error:
                        await failed_key(self._llm.pool, key, error)
                        if emitted or not retryable(error) or attempt + 1 >= min(3, self._llm.pool.total_keys): raise
        except asyncio.CancelledError: raise
        except Exception as error:
            logging.getLogger('voice_agent.provider').warning('Language provider failed (%s)', type(error).__name__)
            raise APIError('The language provider is unavailable', retryable=False) from None
