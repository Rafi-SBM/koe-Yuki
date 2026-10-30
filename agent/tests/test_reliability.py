"""Offline failure/security regressions, with no provider requests."""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0, str(Path(__file__).parents[1] / 'src'))
from key_pool import GroqKeyPool, PoolUnavailable
from kokoro_engine import KokoroLiveKitTTS, detect_language_and_voice
from provider import PooledGroqLLM
from livekit.agents import llm, APIError, APIStatusError

def test_no_dummy_credentials():
    with pytest.raises(PoolUnavailable): GroqKeyPool([])

def test_all_keys_cooling_are_unavailable():
    pool=GroqKeyPool(['secret-one','secret-two'])
    for key in pool.keys: pool.mark_rate_limited(key)
    with pytest.raises(PoolUnavailable): pool.get_api_key()
    assert 'secret-' not in json.dumps(pool.get_status())

def test_missing_and_corrupt_models_fail_before_admission():
    with pytest.raises(RuntimeError): KokoroLiveKitTTS('/missing-model','/missing-voices')
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'model';path.write_bytes(b'not an ONNX model')
        with pytest.raises(RuntimeError, match='checksum'): KokoroLiveKitTTS(str(path),str(path))

def test_language_common_english_words_do_not_switch_voice():
    for text in ['Come here.', 'Please comment on this code.', 'This is a fine example.', 'Review the del statement in Python.', 'Do me a favor.', 'The time is 9 AM EST.']:
        assert detect_language_and_voice(text)[0]=='en-us'
    assert detect_language_and_voice('你好，今天过得怎么样？')[0]=='cmn'

class FakeStream:
    def __init__(self, action): self.action=action
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    def __aiter__(self): return self.iterate()
    async def iterate(self):
        if self.action=='fail': raise APIStatusError('rate limited',status_code=429,retryable=True)
        yield llm.ChatChunk(id='test', delta=llm.ChoiceDelta(role='assistant',content='Tokyo'))
        if self.action=='partial': raise APIStatusError('rate limited',status_code=429,retryable=True)
class FakeEngine:
    def __init__(self, action): self.action=action
    def chat(self,**kwargs): return FakeStream(self.action)

def run_response(actions):
    async def run():
        pool=GroqKeyPool(['key-a','key-b']); pool._index=0
        engine=PooledGroqLLM(pool);calls=[]
        def select(key): calls.append(key);return FakeEngine(actions[len(calls)-1])
        engine.engine=select
        ctx=llm.ChatContext();ctx.add_message(role='user',content='Capital of Japan?')
        output=[]
        with patch('provider.provider_budget',new=async_noop),patch('provider.shared_key_cooldown',new=async_false),patch('provider.mark_shared_key_cooldown',new=async_noop):
            try:
                async with engine.chat(chat_ctx=ctx) as stream:
                    async for chunk in stream: output.append(chunk.delta.content)
            except APIError: return calls, output, False
        return calls, output, True
    return asyncio.run(run())
async def async_noop(*args): pass
async def async_false(*args): return False

def test_llm_fails_over_once_before_any_output():
    calls, output, passed=run_response(['fail','success'])
    assert calls==['key-a','key-b'] and output==['Tokyo'] and passed

def test_llm_never_replays_partial_output():
    calls, output, passed=run_response(['partial','success'])
    assert calls==['key-a'] and output==['Tokyo'] and passed

def test_llm_exhaustion_reports_pause_without_fabricating_an_answer():
    calls, output, passed=run_response(['fail','fail'])
    assert len(calls)==2 and passed and len(output)==1
    assert 'temporarily busy' in output[0] and 'Tokyo' not in output[0]

def test_long_conversation_keeps_instructions_latest_question_and_tool_pair():
    from provider import bounded_context, request_estimate
    context=llm.ChatContext()
    context.add_message(role='system',content='Keep this safety instruction.')
    for index in range(40):
        context.add_message(role='user',content=f'Old question {index}. '+'नमस्ते '*60)
        context.add_message(role='assistant',content='An earlier answer. '*25)
    context.add_message(role='user',content='What did the clock tool return?')
    context.items.extend([
        llm.FunctionCall(call_id='clock-call',name='clock',arguments='{}'),
        llm.FunctionCallOutput(call_id='clock-call',name='clock',output='12:30',is_error=False),
    ])
    original=list(context.items)
    with patch.dict('os.environ',{'GROQ_TPM_LIMIT':'6000'}):
        bounded,estimate=bounded_context(context,[])
    assert estimate<=4096 and request_estimate(bounded,[])==estimate
    assert bounded.items[0].text_content=='Keep this safety instruction.'
    assert bounded.items[-3].text_content=='What did the clock tool return?'
    assert [item.type for item in bounded.items[-2:]]==['function_call','function_call_output']
    assert len(bounded.items)<len(context.items) and context.items==original

def test_single_oversized_question_is_not_silently_truncated():
    from provider import bounded_context
    from shared_store import ProviderBudgetExceeded
    context=llm.ChatContext();context.add_message(role='user',content='अ'*10000)
    with pytest.raises(ProviderBudgetExceeded) as error: bounded_context(context,[])
    assert error.value.reason=='request_size'

def test_expected_budget_pause_does_not_break_next_turn_or_issue_provider_request():
    from unittest.mock import AsyncMock
    from shared_store import ProviderBudgetExceeded
    async def run():
        engine=PooledGroqLLM(GroqKeyPool(['test-key']))
        calls=[];notices=AsyncMock();engine.on_notice=notices
        def select(key): calls.append(key);return FakeEngine('success')
        engine.engine=select
        context=llm.ChatContext();context.add_message(role='user',content='Capital of Japan?')
        results=[]
        with patch('provider.provider_budget',new=AsyncMock(side_effect=[ProviderBudgetExceeded('minute',12),None])),patch('provider.shared_key_cooldown',new=async_false):
            for _ in range(2):
                output=[]
                async with engine.chat(chat_ctx=context) as stream:
                    async for chunk in stream: output.append(chunk.delta.content)
                results.append(''.join(output))
        assert '12 seconds' in results[0] and results[1]=='Tokyo'
        assert len(calls)==1
        assert notices.await_args_list[-1].args==(None,)
    asyncio.run(run())

def test_recognition_budget_pause_keeps_pipeline_available_for_next_utterance():
    from agent import GroqWhisperSTT
    from shared_store import ProviderBudgetExceeded
    from unittest.mock import AsyncMock
    from livekit.agents import stt
    async def run():
        with patch('agent.get_global_key_pool',return_value=GroqKeyPool(['test-key'])):
            engine=GroqWhisperSTT()
        engine.on_notice=AsyncMock()
        good=stt.SpeechEvent(type=stt.SpeechEventType.FINAL_TRANSCRIPT,alternatives=[stt.SpeechData(language='en',text='Hello')])
        with patch.object(engine,'_recognize_bounded',new=AsyncMock(side_effect=[ProviderBudgetExceeded('minute',5),good])):
            paused=await engine._recognize_impl(None)
            resumed=await engine._recognize_impl(None)
        assert paused.alternatives==[] and resumed.alternatives[0].text=='Hello'
        assert '5 seconds' in engine.on_notice.await_args.args[0]
    asyncio.run(run())

def test_evaluation_exits_nonzero_on_required_failures():
    sys.path.insert(0,str(Path(__file__).parents[1]))
    import eval_harness
    with patch.object(eval_harness,'benchmark_tts',return_value={'status':'skipped'}),patch.object(eval_harness,'benchmark_llm',return_value={'status':'failed','error':'Injected failure'}),patch.object(eval_harness,'get_global_key_pool',return_value=object()):
        assert eval_harness.main()==1
async def async_failed(): return {'status':'failed','error':'Injected failure'}

def test_retry_headers_and_cooldown_do_not_shorten_a_provider_wait():
    from retry_policy import retry_seconds
    assert retry_seconds({'retry-after':'120'})==120
    assert retry_seconds({'retry-after':'1200'})==1200
    assert retry_seconds({'retry-after':'NaN'})==60
    pool=GroqKeyPool(['only-key'])
    pool.mark_rate_limited('only-key',120)
    deadline=pool._cooldown_until['only-key']
    pool.mark_rate_limited('only-key',60)
    assert pool._cooldown_until['only-key']>=deadline
    pool.mark_rate_limited('only-key',1200)
    long_deadline=pool._cooldown_until['only-key']
    pool.mark_error('only-key')
    assert pool._cooldown_until['only-key']>=long_deadline

def test_transcript_telemetry_exports_counts_only():
    from telemetry import VoiceObservability
    from unittest.mock import MagicMock
    telemetry=VoiceObservability('synthetic-room'); telemetry.langfuse_client=MagicMock()
    telemetry.record_turn('user','sensitive test phrase')
    exported=telemetry.langfuse_client.start_observation.call_args.kwargs
    assert exported['input']=={'characters':21}
    assert 'sensitive test phrase' not in str(telemetry.langfuse_client.mock_calls)

def test_budget_refunds_unused_tokens_without_refunding_requests():
    import shared_store
    async def run():
        with patch.dict('os.environ', {'YUKI_ENV':'development','UPSTASH_REDIS_REST_URL':'','UPSTASH_REDIS_REST_TOKEN':'','GROQ_TPM_LIMIT':'8000','DAILY_PROVIDER_REQUEST_LIMIT':'3'}), patch('shared_store.time.time', return_value=1000):
            shared_store._local_budget.clear()
            shared_store._local_daily.update(day=-1,requests=0,tokens=0)
            for _ in range(3):
                reservation=await shared_store.provider_budget('synthetic',3000)
                await shared_store.settle_provider_budget(reservation,100)
            assert shared_store._local_daily['tokens']==300
            assert shared_store._local_daily['requests']==3
            with pytest.raises(APIError): await shared_store.provider_budget('synthetic',3000)
    asyncio.run(run())

def test_remote_cleanup_failure_still_disconnects_and_shuts_down_job():
    from lifecycle import end_session
    from unittest.mock import AsyncMock, MagicMock
    ctx=MagicMock();ctx.room.name='synthetic-room'
    ctx.room.disconnect=AsyncMock()
    ctx.api.room.delete_room=AsyncMock(side_effect=TimeoutError())
    session=MagicMock();session.aclose=AsyncMock()
    asyncio.run(end_session(ctx,session,'session deadline'))
    session.aclose.assert_awaited_once()
    ctx.room.disconnect.assert_awaited_once()
    ctx.shutdown.assert_called_once_with(reason='session deadline')

def test_worker_requires_a_live_lease_and_rejects_cleanup_grace():
    from shared_store import room_is_admitted
    from unittest.mock import AsyncMock
    async def run():
        with patch.dict('os.environ', {'YUKI_ENV':'production'}), patch('shared_store.time.time', return_value=1000):
            for score, expected in [(None,False),('NaN',False),('invalid',False),(1020000,False),(1040000,True)]:
                with patch('shared_store.command',new=AsyncMock(return_value=score)):
                    assert await room_is_admitted('synthetic-room') is expected
            with patch('shared_store.command',new=AsyncMock(side_effect=APIError('unavailable'))):
                assert not await room_is_admitted('synthetic-room')
    asyncio.run(run())


def test_heartbeat_starts_without_a_load_callback_and_only_once():
    import shared_store
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    worker = SimpleNamespace(_closed=False, _connecting=False, _draining=False,
                             active_jobs=[], _proc_pool=SimpleNamespace(
                                 _warmed_proc_queue=SimpleNamespace(qsize=lambda: 1)))
    commands = []

    async def command(*items):
        commands.append(items)
        if items[0] == 'ZADD':
            worker._closed = True
        return 1

    async def run():
        shared_store._heartbeat_task = None
        try:
            with patch('shared_store.command', side_effect=command), patch('shared_store.asyncio.sleep', new=AsyncMock()):
                task = shared_store.start_worker_heartbeat(worker)
                assert shared_store.start_worker_heartbeat(worker) is task
                await task
            assert [item[0] for item in commands] == ['SET', 'ZADD']
            assert json.loads(commands[0][2]) == {'ready': True, 'accepting': True, 'active': 0}
            assert commands[0][-2:] == ('EX', 20)
        finally:
            shared_store._heartbeat_task = None
    asyncio.run(run())
