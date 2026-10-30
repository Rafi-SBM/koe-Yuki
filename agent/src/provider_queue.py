"""Bounded FIFO provider slots shared by job processes and worker replicas."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import logging
import os
import time
import uuid

from shared_store import ProviderBudgetExceeded, command

CLAIM = """
local expired=redis.call('ZRANGEBYSCORE',KEYS[2],'-inf',ARGV[1]);
for _,id in ipairs(expired) do redis.call('ZREM',KEYS[1],id); redis.call('ZREM',KEYS[2],id) end;
local holder=redis.call('GET',KEYS[4]);
if holder==ARGV[2] then return {1,0} end;
if not redis.call('ZSCORE',KEYS[1],ARGV[2]) then
 if redis.call('ZCARD',KEYS[1])>=12 then return {-1,0} end;
 local n=redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],300);
 redis.call('ZADD',KEYS[1],n,ARGV[2]);
end;
redis.call('ZADD',KEYS[2],ARGV[3],ARGV[2]);
redis.call('EXPIRE',KEYS[1],90); redis.call('EXPIRE',KEYS[2],90);
if not holder and redis.call('ZRANGE',KEYS[1],0,0)[1]==ARGV[2] then
 redis.call('SET',KEYS[4],ARGV[2],'PX',30000);
 redis.call('ZREM',KEYS[1],ARGV[2]); redis.call('ZREM',KEYS[2],ARGV[2]); return {1,0};
end;
return {0,redis.call('ZRANK',KEYS[1],ARGV[2])+(holder and 1 or 0)}
"""
RELEASE = """
redis.call('ZREM',KEYS[1],ARGV[1]); redis.call('ZREM',KEYS[2],ARGV[1]);
if redis.call('GET',KEYS[4])==ARGV[1] then redis.call('DEL',KEYS[4]) end; return 1
"""
_local_locks = {}


async def _notice(handler, position):
    if handler is None: return
    message = None if position == 0 else f"Preparing your reply. {position} {'other reply is' if position == 1 else 'other replies are'} ahead."
    try:
        async with asyncio.timeout(3): await handler(message)
    except Exception:
        logging.getLogger('voice_agent.queue').warning('Queue notice unavailable')


@asynccontextmanager
async def provider_turn(model, handler=None):
    if not os.getenv('UPSTASH_REDIS_REST_URL'):
        if os.getenv('YUKI_ENV') == 'production':
            # Do not bypass shared controls on a deployed worker.
            await command('PING')
        key = (asyncio.get_running_loop(), model)
        lock = _local_locks.setdefault(key, asyncio.Lock())
        if lock.locked(): await _notice(handler, 1)
        try:
            async with asyncio.timeout(45): await lock.acquire()
        except TimeoutError: raise ProviderBudgetExceeded('queue', 3) from None
        try:
            await _notice(handler, 0)
            yield
        finally: lock.release()
        return

    identity = uuid.uuid4().hex
    base = '{yuki}:provider-queue:' + hashlib.sha256(model.encode()).hexdigest()[:16]
    keys = [base+suffix for suffix in (':waiting', ':leases', ':sequence', ':holder')]
    deadline = time.monotonic()+45
    previous = None
    try:
        while time.monotonic()<deadline:
            now = int(time.time()*1000)
            acquired, position = await command('EVAL', CLAIM, 4, *keys, now, identity, now+60000)
            if acquired == 1:
                await _notice(handler, 0)
                break
            if acquired == -1: raise ProviderBudgetExceeded('queue', 3)
            if position != previous:
                await _notice(handler, max(1, position)); previous = position
            await asyncio.sleep(.4)
        else: raise ProviderBudgetExceeded('queue', 3)
        yield
    finally:
        try: await asyncio.shield(command('EVAL', RELEASE, 4, *keys, identity))
        except Exception:
            # Both abandoned queue entries and active slots have bounded leases.
            logging.getLogger('voice_agent.queue').warning('Provider slot cleanup unavailable')
