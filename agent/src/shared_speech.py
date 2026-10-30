"""One verified Kokoro model per worker, served only on authenticated loopback.

Job processes submit one bounded chunk at a time. FIFO scheduling interleaves
callers' chunks without loading another ONNX model for each conversation.
"""
import asyncio
from collections import OrderedDict
from dataclasses import dataclass
import math
import os
import secrets
import uuid

from aiohttp import web
import numpy as np
import requests

CACHEABLE = {"Hello.", "Hey, I'm Yuki.", "What can I help with?"}
LANGUAGES = {'en-us', 'en-gb', 'ja', 'cmn', 'hi', 'es', 'fr-fr', 'it'}


@dataclass
class SpeechRequest:
    owner: str
    text: str
    voice: str
    speed: float
    language: str
    result: asyncio.Future


class SharedSpeechService:
    def __init__(self, token, *, port=8082, engine_factory=None):
        self.token, self.port = token, port
        self.engine_factory = engine_factory
        self.engine = None
        self.queue = asyncio.Queue(maxsize=12)
        self.owners = set()
        self.cache = OrderedDict()
        self.task = None
        self.runner = None
        self.closed = False

    @property
    def ready(self):
        return self.engine is not None and self.task is not None and not self.task.done() and not self.closed

    async def start(self):
        if self.engine_factory is None:
            from kokoro_engine import KokoroLiveKitTTS
            self.engine_factory = KokoroLiveKitTTS
        self.engine = await asyncio.to_thread(self.engine_factory)
        # Exercise the real graph before accepting jobs; child prewarms hit cache.
        await self._render('Hello.', 'af_bella', 1.05, 'en-us')
        self.task = asyncio.create_task(self._consume(), name='yuki-shared-speech')
        app = web.Application(client_max_size=4096)
        app.router.add_get('/health', self._health)
        app.router.add_post('/synthesize', self._synthesize)
        self.runner = web.AppRunner(app, access_log=None, handler_cancellation=True)
        await self.runner.setup()
        site = web.TCPSite(self.runner, '127.0.0.1', self.port)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        return self

    def _authorized(self, request):
        return secrets.compare_digest(request.headers.get('X-Yuki-Speech-Token', ''), self.token)

    async def _health(self, request):
        if not self._authorized(request): raise web.HTTPUnauthorized()
        return web.json_response({'ready': self.ready, 'voices': self.engine.available_voices}, status=200 if self.ready else 503)

    async def _synthesize(self, request):
        if not self._authorized(request): raise web.HTTPUnauthorized()
        if not self.ready: raise web.HTTPServiceUnavailable()
        try:
            body = await request.json()
            owner, text, voice, language = (body[key] for key in ('owner', 'text', 'voice', 'language'))
            speed = float(body['speed'])
            assert isinstance(owner, str) and len(owner) == 32 and all(c in '0123456789abcdef' for c in owner)
            assert isinstance(text, str) and 0 < len(text) <= 160
            assert voice in self.engine.available_voices and language in LANGUAGES
            assert math.isfinite(speed) and .75 <= speed <= 1.5
        except (ValueError, KeyError, TypeError, AssertionError):
            raise web.HTTPBadRequest() from None
        if owner in self.owners or self.queue.full(): raise web.HTTPTooManyRequests()
        position = len(self.owners)
        future = asyncio.get_running_loop().create_future()
        job = SpeechRequest(owner, text, voice, speed, language, future)
        self.owners.add(owner)
        self.queue.put_nowait(job)
        response = web.StreamResponse(headers={'Content-Type': 'application/octet-stream', 'X-Yuki-Queue-Position': str(position)})
        try:
            # Send position before rendering so the caller can display its wait.
            await response.prepare(request)
            pcm = await future
            await response.write(pcm)
            await response.write_eof()
            return response
        finally:
            if not future.done(): future.cancel()
            self.owners.discard(owner)

    async def _render(self, text, voice, speed, language):
        key = (text, voice, speed, language)
        if text in CACHEABLE and key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        loop = asyncio.get_running_loop()
        samples, rate = await loop.run_in_executor(self.engine._executor, lambda: self.engine._kokoro.create(text, voice=voice, speed=speed, lang=language))
        if rate != 24000 or not len(samples) or not np.all(np.isfinite(samples)) or not np.any(np.abs(samples) > 1e-5):
            raise RuntimeError('Invalid shared speech output')
        pcm = np.asarray(samples, dtype='<f4').tobytes()
        if text in CACHEABLE:
            self.cache[key] = pcm
            while len(self.cache) > 32: self.cache.popitem(last=False)
        return pcm

    async def _consume(self):
        while True:
            job = await self.queue.get()
            try:
                if not job.result.cancelled():
                    pcm = await self._render(job.text, job.voice, job.speed, job.language)
                    if not job.result.done(): job.result.set_result(pcm)
            except asyncio.CancelledError:
                if not job.result.done(): job.result.cancel()
                raise
            except Exception as error:
                if not job.result.done(): job.result.set_exception(error)
            finally:
                self.queue.task_done()

    async def aclose(self):
        self.closed = True
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        while not self.queue.empty():
            job = self.queue.get_nowait()
            if not job.result.done(): job.result.cancel()
            self.queue.task_done()
        if self.runner: await self.runner.cleanup()
        if self.engine: await self.engine.aclose()


class RemoteKokoro:
    def __init__(self, url, token):
        if not url.startswith('http://127.0.0.1:'): raise ValueError('Speech sharing requires loopback')
        self.url = url.rstrip('/')
        self.session = requests.Session()
        self.session.trust_env = False
        self.headers = {'X-Yuki-Speech-Token': token}
        self.owner = uuid.uuid4().hex
        self.on_wait = None
        response = self.session.get(self.url+'/health', headers=self.headers, timeout=3)
        response.raise_for_status()
        state = response.json()
        if state.get('ready') is not True: raise RuntimeError('Shared speech is unavailable')
        self.voices = state['voices']

    def get_voices(self): return self.voices

    def create(self, text, *, voice, speed=1.05, lang='en-us'):
        body = {'owner': self.owner, 'text': text, 'voice': voice, 'speed': speed, 'language': lang}
        with self.session.post(self.url+'/synthesize', headers=self.headers, json=body, timeout=(3, 40), stream=True) as response:
            response.raise_for_status()
            position = int(response.headers.get('X-Yuki-Queue-Position', '0'))
            if self.on_wait: self.on_wait(position)
            content = response.content
        if not content or len(content) > 24000*4*30 or len(content) % 4:
            raise RuntimeError('Invalid shared speech response')
        if self.on_wait: self.on_wait(0)
        return np.frombuffer(content, dtype='<f4'), 24000

    def close(self): self.session.close()
