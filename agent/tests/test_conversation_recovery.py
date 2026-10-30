"""Real multi-turn speech gate, including a controlled free-limit pause.

Run only against the owner-authorized demo. The pause adds a conservative minute
reservation while this test owns the sole admitted call. It never clears usage;
the test waits for the next natural minute window before checking recovery.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import sys
import time
import uuid
import wave

import numpy as np
from livekit import rtc
from admission import admit_session

sys.path.insert(0, str(Path(__file__).parents[1] / 'src'))
from shared_store import command


async def main(audio_file, turns):
    with wave.open(audio_file, 'rb') as file:
        assert file.getsampwidth() == 2 and file.getnchannels() == 1
        rate = file.getframerate()
        audio = np.frombuffer(file.readframes(file.getnframes()), dtype=np.int16)
    if rate != 48000:
        audio = np.interp(np.linspace(0, len(audio)-1, round(len(audio)*48000/rate)), np.arange(len(audio)), audio).astype(np.int16)
    admission = await admit_session()
    room = rtc.Room()
    transcripts, notices, acknowledgements, streams, tasks = [], [], {}, [], []
    last_audio, audible, fatal = 0.0, 0, False
    source = None

    @room.on('track_subscribed')
    def subscribed(track, publication, participant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT: return
        stream = rtc.AudioStream(track); streams.append(stream)
        async def consume():
            nonlocal last_audio, audible
            async for event in stream:
                pcm = np.frombuffer(event.frame.data, dtype=np.int16).astype(np.float32)
                if len(pcm) and np.sqrt(np.mean(pcm*pcm)) > 100:
                    last_audio = time.perf_counter(); audible += 1
        tasks.append(asyncio.create_task(consume()))

    @room.on('data_received')
    def received(packet):
        nonlocal fatal
        if packet.participant is None or packet.participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or packet.topic != 'yuki.control': return
        message = json.loads(packet.data)
        if message.get('protocol') != 'yuki.control.v1': return
        if message.get('type') in ('ready','settings_ack'): acknowledgements[message.get('id')] = message
        if message.get('type') == 'transcript': transcripts.append(message)
        if message.get('type') == 'notice' and message.get('message'): notices.append(message['message'])
        if message.get('type') == 'error': fatal = True

    async def control(kind, **settings):
        identity = str(uuid.uuid4()); deadline = time.perf_counter()+90
        while identity not in acknowledgements and time.perf_counter() < deadline:
            await room.local_participant.publish_data(json.dumps({'protocol':'yuki.control.v1','id':identity,'type':kind,**settings}), reliable=True, topic='yuki.control')
            await asyncio.sleep(.5)
        assert identity in acknowledgements, 'Missing worker acknowledgement'

    async def send_question():
        for offset in range(0,len(audio),960):
            chunk = audio[offset:offset+960]
            if len(chunk)<960: chunk=np.pad(chunk,(0,960-len(chunk)))
            await source.capture_frame(rtc.AudioFrame(data=chunk.tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960))
            await asyncio.sleep(.02)
        for _ in range(35):
            await source.capture_frame(rtc.AudioFrame(data=np.zeros(960,dtype=np.int16).tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960))
            await asyncio.sleep(.02)

    started = time.perf_counter()
    results, pauses = [], []
    try:
        await room.connect(admission.server_url, admission.token)
        await control('hello'); await control('settings',voice='af_bella',speed=1.05,responseStyle='concise')
        deadline = time.perf_counter()+30
        while not (last_audio and time.perf_counter()-last_audio>1 and any('yuki' in row.get('text','').lower() for row in transcripts)):
            assert time.perf_counter()<deadline, 'Greeting did not finish'
            await asyncio.sleep(.1)
        source = rtc.AudioSource(48000,1,queue_size_ms=100)
        await room.local_participant.publish_track(rtc.LocalAudioTrack.create_audio_track('synthetic-question',source),rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        for index in range(turns):
            if index == 3:
                minute = int(time.time()//60)
                model = os.getenv('GROQ_LLM_MODEL','openai/gpt-oss-120b')
                limit = int(os.getenv('GROQ_TPM_LIMIT','6000'))
                lua = "if not redis.call('ZSCORE',KEYS[1],ARGV[1]) then return 0 end; redis.call('HINCRBY',KEYS[2],'t',ARGV[2]); redis.call('EXPIRE',KEYS[2],120); return 1"
                assert await command('EVAL',lua,2,'{yuki}:sessions',f'{{yuki}}:quota:{model}:{minute}',admission.room,limit)==1
            for attempt in range(4):
                before, notice_before, audio_before = len(transcripts), len(notices), audible
                await send_question()
                deadline = time.perf_counter()+35
                while time.perf_counter()<deadline:
                    assert not fatal, 'The worker ended the call during a recoverable failure'
                    rows=transcripts[before:]
                    heard=any(row.get('sender')=='user' and 'capital' in row.get('text','').lower() for row in rows)
                    answered=any(row.get('sender')=='agent' and 'tokyo' in row.get('text','').lower() for row in rows)
                    if heard and answered and audible>audio_before+20 and time.perf_counter()-last_audio>1:
                        results.append({'turn':index+1,'heard_question':True,'spoken_answer':'Tokyo'})
                        print('Completed spoken turn',index+1,flush=True)
                        break
                    if len(notices)>notice_before:
                        message=notices[-1]; assert 'tomorrow' not in message, 'Daily demo allowance exhausted'
                        wait=re.search(r'(\d+) seconds',message)
                        seconds=int(wait[1])+2 if wait else 3
                        assert time.perf_counter()-started+seconds<280, 'Recovery exceeded the bounded call duration'
                        pauses.append({'turn':index+1,'wait_seconds':seconds})
                        await asyncio.sleep(seconds)
                        while last_audio and time.perf_counter()-last_audio<1: await asyncio.sleep(.1)
                        break
                    await asyncio.sleep(.1)
                else: raise AssertionError('No recognized question, spoken answer, or recovery notice')
                if len(results)==index+1: break
            assert len(results)==index+1, 'A paused turn never recovered'
        assert pauses, 'Controlled pause was not observed'
        return {'passed':True,'successful_turns':len(results),'same_admitted_room':True,'recoveries':pauses,'duration_seconds':round(time.perf_counter()-started,1),'results':results}
    finally:
        if source: await source.aclose()
        for stream in streams: await stream.aclose()
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await room.disconnect(); await admission.aclose()


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio',required=True,help='Synthetic Japan-capital question, mono PCM16 WAV')
    parser.add_argument('--turns',type=int,default=10)
    args=parser.parse_args()
    print(json.dumps(asyncio.run(main(args.audio,args.turns)),indent=2))
