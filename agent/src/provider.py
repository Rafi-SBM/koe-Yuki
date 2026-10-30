"""One bounded retry loop for Groq; never replay an already-emitted response."""
import asyncio
import os
import json
import logging
import uuid
import httpx
import openai
from retry_policy import retry_seconds
from livekit.agents import llm, APIConnectOptions, APIError, APIStatusError
from livekit.plugins import groq
from key_pool import get_global_key_pool, PoolUnavailable
from shared_store import ProviderBudgetExceeded, provider_budget, settle_provider_budget, shared_key_cooldown, mark_shared_key_cooldown
from provider_queue import provider_turn

def request_estimate(context, tools):
    schemas = [llm.utils.build_legacy_openai_schema(tool) for tool in tools]
    messages, _ = context.to_provider_format('openai')
    return len(json.dumps(messages, ensure_ascii=False).encode('utf8')) + len(json.dumps(schemas, ensure_ascii=False).encode('utf8')) + 512

def bounded_context(context, tools):
    """Keep instructions and complete recent user turns within one reservation.

    Do not mutate the session transcript or drop part of a tool-call/result pair.
    A single oversized turn is declined with a useful notice instead of truncated.
    """
    budget = min(3072, max(256, int(os.getenv('GROQ_TPM_LIMIT', '8000'))))
    items = context.items
    instructions = [item for item in items if item.type == 'message' and item.role in ('system', 'developer')]
    conversation = [item for item in items if item not in instructions]
    starts = [index for index, item in enumerate(conversation) if item.type == 'message' and item.role == 'user'] or [0]
    for start in starts:
        candidate = llm.ChatContext(instructions + conversation[start:])
        estimate = request_estimate(candidate, tools)
        if estimate <= budget:
            return candidate, estimate
    raise ProviderBudgetExceeded('request_size')

def provider_notice(error):
    if isinstance(error, ProviderBudgetExceeded):
        if error.reason == 'daily':
            return "Today's free allowance has been used up. Please come back tomorrow."
        if error.reason in ('request_size', 'speech_length'):
            return 'That question is too long for the free voice service. Please try a shorter question.'
        if error.reason == 'queue':
            return 'The reply queue is busy. Please try again in a few seconds.'
        return f'The free service needs a short pause. Please try again in {max(1, error.retry_after)} seconds.'
    return 'I could not answer that turn because the service is temporarily busy. Please try again in a moment.'

async def send_notice(handler, message):
    if handler is not None:
        try:
            async with asyncio.timeout(3):
                await handler(message)
        except Exception:
            logging.getLogger('voice_agent.provider').warning('Provider notice could not be delivered')

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
        self.on_notice = None
    @property
    def model(self): return os.getenv('GROQ_LLM_MODEL', 'openai/gpt-oss-120b')
    @property
    def provider(self): return 'groq'
    def chat(self, *, chat_ctx, tools=None, conn_options=None, **kwargs):
        return PooledStream(self, chat_ctx=chat_ctx, tools=tools or [], conn_options=APIConnectOptions(max_retry=0, timeout=65), options=kwargs)
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
        self._emitted = False
        try:
            context, estimate = bounded_context(self._chat_ctx, self._tools)
            async with provider_turn(self._llm.model, self._llm.on_notice):
                await self._generate(context, estimate)
                return
        except asyncio.CancelledError: raise
        except Exception as error:
            logging.getLogger('voice_agent.provider').warning('Language provider paused (%s; reason=%s)', type(error).__name__, getattr(error, 'reason', 'provider'))
            if isinstance(error, (APIError, openai.APIError, httpx.TransportError, TimeoutError, PoolUnavailable)):
                message = 'That response was interrupted. Please ask again.' if self._emitted else provider_notice(error)
                await send_notice(self._llm.on_notice, message)
                if not self._emitted:
                    self._event_ch.send_nowait(llm.ChatChunk(id=str(uuid.uuid4()), delta=llm.ChoiceDelta(role='assistant', content=message)))
                return
            raise APIError('The language provider is unavailable', retryable=False) from None

    async def _generate(self, context, estimate):
        async with asyncio.timeout(20):
            for attempt in range(min(3, self._llm.pool.total_keys)):
                key = await next_key(self._llm.pool)
                # Keep the conservative UTF-8 reservation and all hard quotas.
                reservation = await provider_budget(self._llm.model, estimate)
                usage = None
                try:
                    async with self._llm.engine(key).chat(chat_ctx=context, tools=self._tools, conn_options=APIConnectOptions(max_retry=0, timeout=8), **self.options) as stream:
                        async for chunk in stream:
                            if chunk.usage is not None: usage = chunk.usage
                            self._emitted = True
                            self._event_ch.send_nowait(chunk)
                    if usage is not None: await settle_provider_budget(reservation, usage.total_tokens)
                    await send_notice(self._llm.on_notice, None)
                    return
                except Exception as error:
                    if not self._emitted and getattr(error, 'status_code', None) in (401, 403, 429):
                        await settle_provider_budget(reservation, 0)
                    await failed_key(self._llm.pool, key, error)
                    if self._emitted or not retryable(error) or attempt + 1 >= min(3, self._llm.pool.total_keys): raise
