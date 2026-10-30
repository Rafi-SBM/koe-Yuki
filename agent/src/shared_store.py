"""Shared quota/cooldown controls and short-lived worker readiness heartbeats."""
import asyncio
import hashlib
import json
import math
import os
import time
import uuid
import aiohttp
from livekit.agents import APIError

async def command(*items):
    url, token = os.getenv('UPSTASH_REDIS_REST_URL'), os.getenv('UPSTASH_REDIS_REST_TOKEN')
    if not url or not token:
        if os.getenv('YUKI_ENV') == 'production': raise APIError('Shared controls unavailable', retryable=False)
        return None
    if not url.startswith('https://'): raise APIError('Shared controls require HTTPS', retryable=False)
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as client:
            async with client.post(url, headers={'Authorization': f'Bearer {token}'}, json=list(items)) as response:
                if response.status != 200: raise RuntimeError('Shared store unavailable')
                data = await response.json()
                if data.get('error'): raise RuntimeError('Shared command failed')
                return data['result']
    except Exception as error: raise APIError('Shared controls unavailable', retryable=False) from error

async def shared_key_cooldown(key):
    return bool(await command('EXISTS', '{yuki}:cooldown:' + hashlib.sha256(key.encode()).hexdigest()))

async def mark_shared_key_cooldown(key, seconds):
    await command('EVAL', "local ttl=redis.call('TTL',KEYS[1]); if ttl<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],'1','EX',ARGV[1]) end; return 1", 1, '{yuki}:cooldown:' + hashlib.sha256(key.encode()).hexdigest(), seconds)

async def room_is_admitted(room):
    if not os.getenv('UPSTASH_REDIS_REST_URL') and os.getenv('YUKI_ENV') != 'production': return True
    try:
        expires = await command('ZSCORE', '{yuki}:sessions', room)
        # Frontend leases retain a 30-second cleanup grace after the call deadline.
        return expires is not None and math.isfinite(float(expires)) and float(expires) > time.time() * 1000 + 30000
    except (APIError, ValueError, TypeError): return False

_local_budget = {}
_local_daily = {"day": -1, "requests": 0, "tokens": 0}
async def provider_budget(model, estimated_tokens):
    rpm = max(1, int(os.getenv('GROQ_RPM_LIMIT', '20')))
    tpm = max(256, int(os.getenv('GROQ_TPM_LIMIT', '8000')))
    daily_requests = max(1, int(os.getenv('DAILY_PROVIDER_REQUEST_LIMIT', '500')))
    daily_tokens = max(256, int(os.getenv('GROQ_DAILY_TOKEN_LIMIT', '200000')))
    now = int(time.time() // 60)
    key = f'{{yuki}}:quota:{model}:{now}'
    day_key = f'{{yuki}}:quota:day:{now // 1440}'
    lua = "local r=tonumber(redis.call('HGET',KEYS[1],'r') or 0); local t=tonumber(redis.call('HGET',KEYS[1],'t') or 0); local dr=tonumber(redis.call('HGET',KEYS[2],'r') or 0); local dt=tonumber(redis.call('HGET',KEYS[2],'t') or 0); if r>=tonumber(ARGV[1]) or t+tonumber(ARGV[3])>tonumber(ARGV[2]) or dr>=tonumber(ARGV[4]) or dt+tonumber(ARGV[3])>tonumber(ARGV[5]) then return 0 end; redis.call('HINCRBY',KEYS[1],'r',1); redis.call('HINCRBY',KEYS[1],'t',ARGV[3]); redis.call('EXPIRE',KEYS[1],120); redis.call('HINCRBY',KEYS[2],'r',1); redis.call('HINCRBY',KEYS[2],'t',ARGV[3]); redis.call('EXPIRE',KEYS[2],172800); return 1"
    result = await command('EVAL', lua, 2, key, day_key, rpm, tpm, estimated_tokens, daily_requests, daily_tokens)
    if result is None:
        # Development fallback only. Production always uses shared atomic counters.
        if _local_daily['day'] != now // 1440: _local_daily.update(day=now // 1440, requests=0, tokens=0)
        bucket = _local_budget.get(model, (now, 0, 0))
        _, requests, tokens = bucket if bucket[0] == now else (now, 0, 0)
        result = int(requests < rpm and tokens + estimated_tokens <= tpm and _local_daily['requests'] < daily_requests and _local_daily['tokens'] + estimated_tokens <= daily_tokens)
        if result:
            _local_budget[model] = (now, requests + 1, tokens + estimated_tokens)
            _local_daily['requests'] += 1
            _local_daily['tokens'] += estimated_tokens
    if result != 1: raise APIError('Provider budget exhausted; please retry later', retryable=False)
    return (model, now, estimated_tokens, result is not None and bool(os.getenv('UPSTASH_REDIS_REST_URL')))

async def settle_provider_budget(reservation, actual_tokens):
    """Refund unused reserved tokens only after a complete, metered response."""
    if reservation is None: return
    model, minute, reserved, shared = reservation
    refund = max(0, reserved - max(0, actual_tokens))
    if not refund: return
    if shared:
        lua = "for _,key in ipairs(KEYS) do if redis.call('EXISTS',key)==1 then local t=tonumber(redis.call('HGET',key,'t') or 0); redis.call('HSET',key,'t',math.max(0,t-tonumber(ARGV[1]))) end end; return 1"
        await command('EVAL', lua, 2, f'{{yuki}}:quota:{model}:{minute}', f'{{yuki}}:quota:day:{minute // 1440}', refund)
    else:
        bucket = _local_budget.get(model)
        if bucket and bucket[0] == minute: _local_budget[model] = (minute, bucket[1], max(0, bucket[2] - refund))
        if _local_daily['day'] == minute // 1440: _local_daily['tokens'] = max(0, _local_daily['tokens'] - refund)

_worker_id = '{yuki}:worker:' + str(uuid.uuid4())
_heartbeat_task = None

def worker_load(worker):
    global _heartbeat_task
    maximum = max(1, int(os.getenv('MAX_CONCURRENT_SESSIONS', '1')))
    load = min(1.0, len(worker.active_jobs) / maximum)
    if _heartbeat_task is None:
        async def heartbeat():
            while not worker._closed:
                try:
                    # SDK process pool exposes only fully initialized warm processes.
                    pool = worker._proc_pool
                    ready = not worker._connecting and (pool._warmed_proc_queue.qsize() > 0 or bool(worker.active_jobs))
                    state = json.dumps({'ready': ready, 'accepting': len(worker.active_jobs) < maximum and not worker._draining, 'active': len(worker.active_jobs)})
                    await command('SET', _worker_id, state, 'EX', 20)
                    await command('ZADD', '{yuki}:workers', int(time.time() * 1000) + 20000, _worker_id)
                except Exception:
                    import logging
                    logging.getLogger('voice_agent.readiness').warning('Readiness heartbeat unavailable')
                await asyncio.sleep(5)
        _heartbeat_task = asyncio.run_coroutine_threadsafe(heartbeat(), worker._loop)
    return load
