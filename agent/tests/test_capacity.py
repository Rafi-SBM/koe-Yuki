"""Offline concurrency, cancellation and single-model speech regressions."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sys
import threading
from unittest.mock import AsyncMock, patch

import aiohttp
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / 'src'))
from provider_queue import provider_turn, _local_locks
from shared_speech import SharedSpeechService, RemoteKokoro


def test_provider_slots_are_fifo_and_cancelled_waiters_do_not_block():
    async def run():
        order=[]; release=asyncio.Event(); entered=asyncio.Event()
        async def caller(name):
            async with provider_turn('offline-queue'):
                order.append(name)
                if name=='first': entered.set(); await release.wait()
                await asyncio.sleep(0)
        with patch.dict(os.environ,{'UPSTASH_REDIS_REST_URL':'','YUKI_ENV':'development'}):
            first=asyncio.create_task(caller('first')); await entered.wait()
            cancelled=asyncio.create_task(caller('cancelled')); await asyncio.sleep(0)
            second=asyncio.create_task(caller('second')); await asyncio.sleep(0)
            third=asyncio.create_task(caller('third')); await asyncio.sleep(0)
            cancelled.cancel(); await asyncio.gather(cancelled,return_exceptions=True)
            release.set();await asyncio.gather(first,second,third)
        assert order==['first','second','third']
        _local_locks.clear()
    asyncio.run(run())


def test_production_queue_never_falls_back_to_a_local_lock():
    async def run():
        with patch.dict(os.environ,{'UPSTASH_REDIS_REST_URL':'','YUKI_ENV':'production'}),patch('provider_queue.command',new=AsyncMock(side_effect=RuntimeError('Unavailable'))):
            with pytest.raises(RuntimeError):
                async with provider_turn('blocked'): raise AssertionError('Local fallback used')
    asyncio.run(run())


class FakeEngine:
    def __init__(self):
        self.available_voices=['af_bella','am_adam']
        self._executor=ThreadPoolExecutor(max_workers=1)
        self._kokoro=self
        self.calls=[]
        self.gate=threading.Event()
    def create(self,text,**kwargs):
        self.calls.append(text)
        if text=='first': assert self.gate.wait(timeout=5)
        return np.full(2400,.2 if kwargs['voice']=='af_bella' else .4,dtype=np.float32),24000
    async def aclose(self):
        self.gate.set()
        await asyncio.to_thread(self._executor.shutdown,wait=True)


def test_three_speech_clients_share_one_model_and_keep_voices_separate():
    async def run():
        engines=[]
        def factory():
            engine=FakeEngine();engines.append(engine);return engine
        service=await SharedSpeechService('test-token',port=0,engine_factory=factory).start()
        clients=[]
        try:
            url=f'http://127.0.0.1:{service.port}'
            clients=await asyncio.gather(*(asyncio.to_thread(RemoteKokoro,url,'test-token') for _ in range(3)))
            results=await asyncio.gather(*(asyncio.to_thread(client.create,'Hello.',voice='am_adam' if i==1 else 'af_bella') for i,client in enumerate(clients)))
            assert len(engines)==1
            assert [round(float(samples[0]),1) for samples,rate in results]==[.2,.4,.2]
            assert all(rate==24000 for samples,rate in results)
            # Identical fixed greetings are cached, not inferred per conversation.
            assert engines[0].calls.count('Hello.')==2
            assert len({client.owner for client in clients})==3
        finally:
            for client in clients: client.close()
            await service.aclose()
    asyncio.run(run())


def test_speech_queue_is_fifo_authenticated_and_cancellation_safe():
    async def run():
        engine=FakeEngine()
        service=await SharedSpeechService('secret',port=0,engine_factory=lambda:engine).start()
        url=f'http://127.0.0.1:{service.port}'
        headers={'X-Yuki-Speech-Token':'secret'}
        def body(owner,text): return {'owner':owner*32,'text':text,'voice':'af_bella','speed':1.05,'language':'en-us'}
        try:
            async with aiohttp.ClientSession() as client:
                async with client.get(url+'/health') as response: assert response.status==401
                first=await client.post(url+'/synthesize',headers=headers,json=body('a','first'))
                cancelled=await client.post(url+'/synthesize',headers=headers,json=body('b','cancelled'))
                third=await client.post(url+'/synthesize',headers=headers,json=body('c','third'))
                assert first.headers['X-Yuki-Queue-Position']=='0'
                assert cancelled.headers['X-Yuki-Queue-Position']=='1'
                assert third.headers['X-Yuki-Queue-Position']=='2'
                async with client.post(url+'/synthesize',headers=headers,json=body('a','duplicate')) as response: assert response.status==429
                cancelled.close();await asyncio.sleep(.05)
                engine.gate.set()
                assert len(await first.read())==9600
                assert len(await third.read())==9600
                assert engine.calls==['Hello.','first','third']
                assert len(service.cache)==1
                async with client.post(url+'/synthesize',headers=headers,json=body('d','x'*161)) as response: assert response.status==400
        finally:
            engine.gate.set(); await service.aclose()
    asyncio.run(run())


def test_shared_speech_starts_before_job_processes_and_closes_after_worker():
    from worker_runtime import YukiAgentServer
    from livekit.agents import AgentServer
    async def run():
        service=type('Service',(),{'ready':True,'port':8082,'start':AsyncMock(),'aclose':AsyncMock()})()
        server=YukiAgentServer()
        async def sdk_run(*args,**kwargs):
            assert server.speech_ready
            assert os.environ['YUKI_SPEECH_URL']=='http://127.0.0.1:8082'
            assert len(os.environ['YUKI_SPEECH_TOKEN'])>=32
        with patch.dict(os.environ,{'YUKI_SHARED_SPEECH':'true'}),patch('shared_speech.SharedSpeechService',return_value=service),patch.object(AgentServer,'run',new=sdk_run):
            await server.run()
        service.start.assert_awaited_once();service.aclose.assert_awaited_once()
    asyncio.run(run())


@pytest.mark.skipif(os.getenv('YUKI_TEST_SHARED_QUEUE')!='true',reason='Explicit owner-authorized Redis integration only')
def test_real_shared_queue_is_fifo_and_removes_cancelled_waiters():
    import hashlib
    import uuid
    from shared_store import command
    async def run():
        model='test-fifo-'+uuid.uuid4().hex
        base='{yuki}:provider-queue:'+hashlib.sha256(model.encode()).hexdigest()[:16]
        order=[];entered=asyncio.Event();release=asyncio.Event()
        async def caller(name):
            async with provider_turn(model):
                order.append(name)
                if name=='first':entered.set();await release.wait()
                await asyncio.sleep(.05)
        async def queued(count):
            async with asyncio.timeout(10):
                while await command('ZCARD',base+':waiting')!=count:await asyncio.sleep(.1)
        tasks=[]
        try:
            first=asyncio.create_task(caller('first'));tasks.append(first);await asyncio.wait_for(entered.wait(),10)
            cancelled=asyncio.create_task(caller('cancelled'));tasks.append(cancelled);await queued(1)
            second=asyncio.create_task(caller('second'));tasks.append(second);await queued(2)
            third=asyncio.create_task(caller('third'));tasks.append(third);await queued(3)
            cancelled.cancel();await asyncio.gather(cancelled,return_exceptions=True);await queued(2)
            release.set();await asyncio.gather(first,second,third)
            assert order==['first','second','third']
            assert await command('ZCARD',base+':waiting')==0
            assert await command('EXISTS',base+':holder')==0
        finally:
            for task in tasks:task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
            await command('DEL',*(base+suffix for suffix in (':waiting',':leases',':sequence',':holder')))
    asyncio.run(run())
