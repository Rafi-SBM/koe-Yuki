"""Real synthetic interruption gate; uses the same admitted-room contract as E2E."""
import asyncio
import gc
import json
import os
import time
import uuid
import numpy as np
from test_concurrency import admit_session
from kokoro_engine import KokoroLiveKitTTS
from livekit import rtc, api

async def main():
    engine=KokoroLiveKitTTS()
    questions=[]
    for text in ['Please count from one to fifty slowly, one number at a time.', 'What is the capital of Japan?']:
        audio,rate=engine._kokoro.create(text,voice='af_bella',lang='en-us')
        length=round(len(audio)*48000/rate)
        questions.append(np.interp(np.linspace(0,len(audio)-1,length),np.arange(len(audio)),audio).astype(np.float32))
    engine._executor.shutdown(wait=True)
    del engine
    gc.collect()
    admission=await admit_session()
    room=rtc.Room();name=admission.room;identity=admission.identity
    frames=[];transcripts=[];acks={};streams=[];tasks=[];source=None
    url=admission.server_url
    @room.on('track_subscribed')
    def track_received(track,publication,participant):
        if participant.kind!=rtc.ParticipantKind.PARTICIPANT_KIND_AGENT: return
        stream=rtc.AudioStream(track);streams.append(stream)
        async def consume():
            async for event in stream:
                pcm=np.frombuffer(event.frame.data,dtype=np.int16).astype(np.float32)
                if len(pcm) and np.sqrt(np.mean(pcm*pcm))>100: frames.append(time.perf_counter())
        tasks.append(asyncio.create_task(consume()))
    @room.on('data_received')
    def received(packet):
        if packet.participant is None or packet.participant.kind!=rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or packet.topic!='yuki.control': return
        try:
            data=json.loads(packet.data)
            if data.get('type')=='transcript': transcripts.append(data)
            if data.get('type') in ['ready','settings_ack']: acks[data.get('id')]=data
        except (ValueError,UnicodeDecodeError): pass
    async def control(kind,**extra):
        request_id=str(uuid.uuid4());deadline=time.perf_counter()+45
        while request_id not in acks and time.perf_counter()<deadline:
            await room.local_participant.publish_data(json.dumps({'protocol':'yuki.control.v1','type':kind,'id':request_id,**extra}),reliable=True,topic='yuki.control');await asyncio.sleep(.5)
        assert request_id in acks,'No worker acknowledgement'
    async def send(audio):
        pcm=(np.clip(audio,-1,1)*32767).astype(np.int16)
        for offset in range(0,len(pcm),960):
            chunk=pcm[offset:offset+960]
            if len(chunk)<960: chunk=np.pad(chunk,(0,960-len(chunk)))
            await source.capture_frame(rtc.AudioFrame(data=chunk.tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960));await asyncio.sleep(.02)
        await source.wait_for_playout()
        ended=time.perf_counter()
        for _ in range(30):
            await source.capture_frame(rtc.AudioFrame(data=np.zeros(960,dtype=np.int16).tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960));await asyncio.sleep(.02)
        return ended
    try:
        await room.connect(url,admission.token)
        await control('hello');await control('settings',voice='af_bella',speed=1.05,responseStyle='concise')
        deadline=time.perf_counter()+45
        while time.perf_counter()<deadline:
            if any('yuki' in row.get('text','').lower() for row in transcripts) and frames and time.perf_counter()-frames[-1]>1: break
            await asyncio.sleep(.1)
        else: raise AssertionError('Greeting did not finish')
        source=rtc.AudioSource(48000,1,queue_size_ms=100)
        await room.local_participant.publish_track(rtc.LocalAudioTrack.create_audio_track('synthetic-mic',source),rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        frames.clear();transcripts.clear();await send(questions[0])
        deadline=time.perf_counter()+30
        while len(frames)<20 and time.perf_counter()<deadline: await asyncio.sleep(.05)
        assert len(frames)>=20,'No count response to interrupt'
        interruption_started=time.perf_counter();frames.clear()
        ended=await send(questions[1])
        old_audio=[frame for frame in frames if frame<ended]
        stop_ms=max(0,(max(old_audio,default=interruption_started)-interruption_started)*1000)
        assert stop_ms<=1500,f'Agent playback did not stop promptly: {stop_ms:.0f}ms'
        deadline=time.perf_counter()+30
        while time.perf_counter()<deadline:
            answered=any(row.get('sender')=='agent' and 'tokyo' in row.get('text','').lower() for row in transcripts)
            heard=any(row.get('sender')=='user' and 'capital' in row.get('text','').lower() for row in transcripts)
            audible=any(frame>ended for frame in frames)
            if answered and heard and audible: break
            await asyncio.sleep(.1)
        else: raise AssertionError('No spoken Tokyo answer after interruption')
        print(json.dumps({'passed':True,'interruption_stop_ms':round(stop_ms),'followup_answer':'Tokyo','recognized_interruption':True},indent=2))
        return 0
    finally:
        if source: await source.aclose()
        for stream in streams: await stream.aclose()
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await room.disconnect()
        await admission.aclose()

if __name__=='__main__': raise SystemExit(asyncio.run(main()))
