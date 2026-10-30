"""Bounded credential rotation. Keys never increase an organization's provider quota."""
import os
import time
import secrets
import threading
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
import httpx
from retry_policy import retry_seconds
load_dotenv(Path(__file__).resolve().parents[2] / '.env')
load_dotenv(Path(__file__).resolve().parents[1] / '.env')

class PoolUnavailable(RuntimeError):
    pass

class GroqKeyPool:
    def __init__(self, api_keys=None, default_cooldown_seconds=60.0):
        raw = api_keys if api_keys is not None else (os.getenv('GROQ_API_KEYS') or os.getenv('GROQ_API_KEY', '')).split(',')
        self.keys = list(dict.fromkeys(k.strip() for k in raw if k and k.strip()))
        if not self.keys:
            raise PoolUnavailable('No Groq credentials configured')
        self.default_cooldown_seconds = default_cooldown_seconds
        self._lock = threading.Lock()
        self._index = secrets.randbelow(len(self.keys))
        self._cooldown_until = {key: 0.0 for key in self.keys}
        self._stats = {key: {'requests': 0, 'rate_limits': 0, 'errors': 0} for key in self.keys}
        self._async_clients = {}
    @property
    def total_keys(self): return len(self.keys)
    def get_api_key(self):
        with self._lock:
            now = time.monotonic()
            for offset in range(len(self.keys)):
                index = (self._index + offset) % len(self.keys)
                key = self.keys[index]
                if self._cooldown_until[key] <= now:
                    self._index = (index + 1) % len(self.keys)
                    self._stats[key]['requests'] += 1
                    return key
            raise PoolUnavailable('Provider credentials are cooling down; please retry later')
    def get_async_client(self, api_key=None):
        from groq import AsyncGroq
        key = api_key or self.get_api_key()
        if key not in self._async_clients:
            async def response_hook(response):
                if response.status_code == 429:
                    seconds = retry_seconds(response.headers)
                    self.mark_rate_limited(key, seconds)
                    from shared_store import mark_shared_key_cooldown
                    await mark_shared_key_cooldown(key, int(seconds))
            transport = httpx.AsyncClient(timeout=8.0, event_hooks={"response": [response_hook]})
            self._async_clients[key] = AsyncGroq(api_key=key, timeout=8.0, max_retries=0, http_client=transport)
        return self._async_clients[key]
    def get_sync_client(self, api_key=None):
        from groq import Groq
        return Groq(api_key=api_key or self.get_api_key(), timeout=8.0, max_retries=0)
    def mark_rate_limited(self, api_key, cooldown_seconds=None):
        with self._lock:
            self._cooldown_until[api_key] = max(self._cooldown_until[api_key], time.monotonic() + max(1, min(86400, cooldown_seconds or self.default_cooldown_seconds)))
            self._stats[api_key]['rate_limits'] += 1
    def mark_error(self, api_key):
        with self._lock:
            self._stats[api_key]['errors'] += 1
            self._cooldown_until[api_key] = max(self._cooldown_until[api_key], time.monotonic() + 5)
    def mark_invalid(self, api_key):
        with self._lock: self._cooldown_until[api_key] = float('inf')
    def get_status(self):
        with self._lock:
            return [{'key_id': index, 'is_ready': self._cooldown_until[key] <= time.monotonic(), **self._stats[key]} for index, key in enumerate(self.keys)]
    async def aclose(self):
        for client in self._async_clients.values(): await client.close()
        self._async_clients.clear()

_default_pool: Optional[GroqKeyPool] = None

def get_global_key_pool():
    global _default_pool
    if _default_pool is None: _default_pool = GroqKeyPool()
    return _default_pool
