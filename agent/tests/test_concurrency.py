"""Strict real-room voice gate. Requires a running worker and synthetic audio only."""
import argparse
import asyncio
import gc
import json
import math
import os
import sys
import time
import uuid
from pathlib import Path
import numpy as np
from dotenv import load_dotenv
sys.path.insert(0, str(Path(__file__).parents[1] / 'src'))
load_dotenv(Path(__file__).parents[1] / '.env')
from livekit import api, rtc
from kokoro_engine import KokoroLiveKitTTS

from admission import admit_session

async def run_user(index, audio, sample_rate, timeout):
    admission = await admit_session()
    url, room_name, identity = admission.server_url, admission.room, admission.identity
    room, tasks, streams = rtc.Room(), set(), []
    transcripts, acknowledgements = [], {}
    phase, audible_frames, first_audio, last_audio = 'greeting', 0, None, 0.0
    @room.on('track_subscribed')
    def subscribed(track, publication, participant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or track.kind != rtc.TrackKind.KIND_AUDIO: return
        stream = rtc.AudioStream(track); streams.append(stream)
        async def consume():
            nonlocal audible_frames, first_audio, last_audio
            async for event in stream:
                pcm = np.frombuffer(event.frame.data, dtype=np.int16).astype(np.float32)
                if len(pcm) and np.sqrt(np.mean(pcm * pcm)) > 100:
                    last_audio = time.perf_counter()
                    if phase == 'answer':
                        audible_frames += 1
                        if first_audio is None: first_audio = last_audio
        task = asyncio.create_task(consume()); tasks.add(task)
    @room.on('data_received')
    def received(packet):
        if packet.participant is None or packet.participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or packet.topic != 'yuki.control': return
        try:
            message = json.loads(packet.data)
            if not isinstance(message, dict) or message.get('protocol') != 'yuki.control.v1': return
            if message.get('type') in ('ready', 'settings_ack'): acknowledgements[message.get('id')] = message
            if message.get('type') == 'transcript': transcripts.append(message)
            if message.get('type') == 'error': acknowledgements['error'] = message
        except (UnicodeDecodeError, ValueError): pass
    async def control(kind, **settings):
        request_id = str(uuid.uuid4()); end = time.perf_counter() + 45
        while request_id not in acknowledgements and time.perf_counter() < end:
            await room.local_participant.publish_data(json.dumps({'protocol': 'yuki.control.v1', 'type': kind, 'id': request_id, **settings}), reliable=True, topic='yuki.control')
            await asyncio.sleep(0.5)
        if request_id not in acknowledgements: raise AssertionError('No worker/control acknowledgement')
        return acknowledgements[request_id]
    source = None
    started = time.perf_counter()
    try:
        await room.connect(url, admission.token)
        await control('hello')
        ack = await control('settings', voice='af_sarah', speed=1.15, responseStyle='balanced')
        if ack.get('voice') != 'af_sarah' or ack.get('responseStyle') != 'balanced' or abs(ack.get('speed',0) - 1.15) > 0.01: raise AssertionError('Settings were not applied')
        greeting_deadline = time.perf_counter() + 45
        while time.perf_counter() < greeting_deadline:
            greeting = any(item.get('sender') == 'agent' and 'yuki' in item.get('text','').lower() for item in transcripts)
            if greeting and last_audio and time.perf_counter() - last_audio >= 1.0: break
            await asyncio.sleep(0.1)
        else: raise AssertionError('Greeting did not complete')
        startup_ms = round((time.perf_counter() - started) * 1000)
        source = rtc.AudioSource(sample_rate, 1, queue_size_ms=100)
        track = rtc.LocalAudioTrack.create_audio_track('synthetic-microphone', source)
        await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        transcripts.clear(); phase = 'answer'; first_audio = None; audible_frames = 0
        pcm = (np.clip(audio,-1,1)*32767).astype(np.int16); chunk = int(sample_rate*0.02)
        for offset in range(0,len(pcm),chunk):
            data=pcm[offset:offset+chunk]
            if len(data)<chunk: data=np.pad(data,(0,chunk-len(data)))
            await source.capture_frame(rtc.AudioFrame(data=data.tobytes(),sample_rate=sample_rate,num_channels=1,samples_per_channel=chunk))
            await asyncio.sleep(0.02)
        await source.wait_for_playout()
        speech_ended = time.perf_counter()
        for _ in range(30):
            await source.capture_frame(rtc.AudioFrame(data=np.zeros(chunk,dtype=np.int16).tobytes(),sample_rate=sample_rate,num_channels=1,samples_per_channel=chunk))
            await asyncio.sleep(0.02)
        deadline = speech_ended + timeout
        while time.perf_counter() < deadline:
            answers=[item.get('text','') for item in transcripts if item.get('sender')=='agent']
            user=[item.get('text','') for item in transcripts if item.get('sender')=='user']
            if audible_frames >= 20 and any('tokyo' in text.lower() for text in answers) and any('capital' in text.lower() and 'japan' in text.lower() for text in user): break
            if 'error' in acknowledgements: raise AssertionError('Worker reported a provider/pipeline failure')
            await asyncio.sleep(0.1)
        else: raise AssertionError('Expected user question, Tokyo answer, and non-silent speech were not all received')
        if first_audio is None or first_audio < speech_ended: raise AssertionError('Answer audio measurement preceded end of question')
        return {'user':index,'ok':True,'startup_ms':startup_ms,'first_audio_ms':round((first_audio-speech_ended)*1000),'audible_frames':audible_frames,'answer':' '.join(answers),'settings_ack':True}
    finally:
        if source: await source.aclose()
        for stream in streams: await stream.aclose()
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await room.disconnect()
        await admission.aclose()

def percentile(values, percentile_value):
    if not values: return None
    values=sorted(values); return values[max(0, math.ceil(len(values)*percentile_value)-1)]

async def main(users, timeout, max_first_audio_ms=5000):
    engine=KokoroLiveKitTTS()
    audio,rate=engine._kokoro.create('What is the capital of Japan?',voice='af_bella',lang='en-us',speed=1.0)
    length=round(len(audio)*48000/rate)
    audio=np.interp(np.linspace(0,len(audio)-1,length),np.arange(len(audio)),audio).astype(np.float32)
    engine._executor.shutdown(wait=True)
    del engine
    gc.collect()
    results=await asyncio.gather(*(run_user(index,audio,48000,timeout) for index in range(users)),return_exceptions=True)
    rows=[result if isinstance(result,dict) else {'ok':False,'error':type(result).__name__+': '+str(result)} for result in results]
    timings=[row['first_audio_ms'] for row in rows if row.get('ok')]
    p95=percentile(timings,0.95)
    passed=all(row.get('ok') for row in rows) and p95 is not None and p95<=max_first_audio_ms
    print(json.dumps({'users':users,'passed':sum(bool(row.get('ok')) for row in rows),'p50_first_audio_ms':percentile(timings,0.5),'p95_first_audio_ms':p95,'latency_budget_ms':max_first_audio_ms,'gate_passed':passed,'results':rows},indent=2))
    return 0 if passed else 1

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--users',type=int,default=1);parser.add_argument('--timeout',type=float,default=30);parser.add_argument('--max-first-audio-ms',type=int,default=5000)
    args=parser.parse_args()
    if args.users<1 or args.timeout<=0 or args.max_first_audio_ms<=0: parser.error('Arguments must be positive')
    raise SystemExit(asyncio.run(main(args.users,args.timeout,args.max_first_audio_ms)))
