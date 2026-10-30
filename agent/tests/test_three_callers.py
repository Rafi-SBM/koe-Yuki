"""Owner-authorized hosted capacity gate using synthetic PCM16 questions.

Each caller has its own admission cookie, room, selected voice and microphone.
Questions rotate across rooms each round to detect stale or crossed responses.
This does not reset provider quotas or bypass frontend admission.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import ssl
import time
import uuid
import wave

import aiohttp
import numpy as np
from livekit import rtc
from admission import admit_session

COUNTRIES = [('japan','tokyo'),('france','paris'),('italy','rome')]
VOICES = ['af_bella','am_adam','bf_emma']


class Caller:
    def __init__(self,index):
        self.index=index;self.room=rtc.Room();self.admission=None;self.source=None
        self.transcripts=[];self.acks={};self.notices=[];self.streams=[];self.tasks=[]
        self.last_audio=0.;self.first_audio=None;self.audible=0;self.answering=False;self.fatal=False
        self.agent_ids=set()
        self.room.on('track_subscribed',self.subscribed)
        self.room.on('data_received',self.received)

    def subscribed(self,track,publication,participant):
        if participant.kind!=rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or track.kind!=rtc.TrackKind.KIND_AUDIO:return
        self.agent_ids.add(participant.identity)
        stream=rtc.AudioStream(track);self.streams.append(stream)
        async def consume():
            async for event in stream:
                pcm=np.frombuffer(event.frame.data,dtype=np.int16).astype(np.float32)
                if len(pcm) and np.sqrt(np.mean(pcm*pcm))>100:
                    self.last_audio=time.perf_counter()
                    if self.answering:
                        self.audible+=1
                        if self.first_audio is None:self.first_audio=self.last_audio
        self.tasks.append(asyncio.create_task(consume()))

    def received(self,packet):
        if packet.participant is None or packet.participant.kind!=rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or packet.topic!='yuki.control':return
        message=json.loads(packet.data)
        if message.get('protocol')!='yuki.control.v1':return
        kind=message.get('type')
        if kind in ('ready','settings_ack'):self.acks[message.get('id')]=message
        if kind=='transcript':self.transcripts.append(message)
        if kind=='notice' and message.get('message'):self.notices.append(message)
        if kind=='error':self.fatal=True

    async def control(self,kind,**settings):
        identity=str(uuid.uuid4());deadline=time.perf_counter()+90
        while identity not in self.acks and time.perf_counter()<deadline:
            await self.room.local_participant.publish_data(json.dumps({'protocol':'yuki.control.v1','type':kind,'id':identity,**settings}),reliable=True,topic='yuki.control')
            await asyncio.sleep(.5)
        assert identity in self.acks,'Missing worker/control acknowledgement'
        return self.acks[identity]

    async def setup(self):
        started=time.perf_counter()
        self.admission=await admit_session()
        await self.room.connect(self.admission.server_url,self.admission.token)
        await self.control('hello')
        ack=await self.control('settings',voice=VOICES[self.index],speed=1.05,responseStyle='concise')
        assert ack.get('voice')==VOICES[self.index] and ack.get('responseStyle')=='concise'
        deadline=time.perf_counter()+45
        while time.perf_counter()<deadline:
            if self.last_audio and time.perf_counter()-self.last_audio>1 and any('yuki' in row.get('text','').lower() for row in self.transcripts):break
            assert not self.fatal,'Worker failed during startup'
            await asyncio.sleep(.1)
        else:raise AssertionError('Greeting did not finish')
        self.startup_ms=round((time.perf_counter()-started)*1000)
        self.source=rtc.AudioSource(48000,1,queue_size_ms=100)
        await self.room.local_participant.publish_track(rtc.LocalAudioTrack.create_audio_track('synthetic-question',self.source),rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))

    async def ask(self,question_index,audio,round_index,timeout):
        country,city=COUNTRIES[question_index]
        self.transcripts.clear();self.notices.clear();self.first_audio=None;self.audible=0;self.answering=True
        for offset in range(0,len(audio),960):
            chunk=audio[offset:offset+960]
            if len(chunk)<960:chunk=np.pad(chunk,(0,960-len(chunk)))
            await self.source.capture_frame(rtc.AudioFrame(data=chunk.tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960))
            await asyncio.sleep(.02)
        await self.source.wait_for_playout()
        ended=time.perf_counter()
        for _ in range(35):
            await self.source.capture_frame(rtc.AudioFrame(data=np.zeros(960,dtype=np.int16).tobytes(),sample_rate=48000,num_channels=1,samples_per_channel=960))
            await asyncio.sleep(.02)
        deadline=ended+timeout
        while time.perf_counter()<deadline:
            assert not self.fatal,'Fatal worker error'
            answers=' '.join(row.get('text','') for row in self.transcripts if row.get('sender')=='agent').lower()
            heard=' '.join(row.get('text','') for row in self.transcripts if row.get('sender')=='user').lower()
            if country in heard and 'capital' in heard and city in answers and self.audible>=20 and time.perf_counter()-self.last_audio>1:break
            await asyncio.sleep(.1)
        else:raise AssertionError(f'Caller {self.index+1}, round {round_index}: missing recognized question or complete spoken {city} answer; notices={[m.get("message") for m in self.notices]}')
        assert self.first_audio is not None and self.first_audio>ended,'Answer measurement preceded question end'
        assert not any(other_city in answers for other_country,other_city in COUNTRIES if other_city!=city),'Answer crossed room boundaries'
        self.answering=False
        return {'caller':self.index+1,'round':round_index,'question':country,'answer':city,'voice':VOICES[self.index],'first_audio_ms':round((self.first_audio-ended)*1000),'audible_frames':self.audible,'queue_notices':sum('ahead' in m.get('message','') for m in self.notices)}

    async def close(self):
        if self.source:await self.source.aclose()
        for stream in self.streams:await stream.aclose()
        for task in self.tasks:task.cancel()
        await asyncio.gather(*self.tasks,return_exceptions=True)
        await self.room.disconnect()
        if self.admission:await self.admission.aclose()


async def main(paths,rounds,latency_budget,timeout,hold_seconds):
    audio=[]
    for path in paths:
        with wave.open(path,'rb') as file:
            assert (file.getnchannels(),file.getsampwidth(),file.getframerate())==(1,2,48000)
            audio.append(np.frombuffer(file.readframes(file.getnframes()),dtype=np.int16))
    callers=[Caller(index) for index in range(3)]
    started=time.perf_counter()
    try:
        await asyncio.gather(*(caller.setup() for caller in callers))
        assert len({caller.admission.room for caller in callers})==3
        assert len({caller.admission.identity for caller in callers})==3
        assert all(len(caller.agent_ids)==1 for caller in callers)
        origin=os.getenv('YUKI_TEST_ORIGIN','http://localhost:3000').rstrip('/')
        context=ssl.create_default_context()
        if os.getenv('YUKI_TEST_CA_FILE'):context.load_verify_locations(os.environ['YUKI_TEST_CA_FILE'])
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=context)) as client:
            async with client.post(origin+'/api/token',headers={'Origin':origin},json={'consent':True,'accessCode':os.getenv('YUKI_TEST_ACCESS_CODE','')}) as response:
                result=await response.json()
                assert response.status==429 and 'capacity' in result.get('message',''),'Fourth call was not rejected by capacity control'
        print('Three independent callers ready; fourth call rejected by capacity control.',flush=True)
        rows=[]
        for round_index in range(rounds):
            indices=[(caller.index+round_index)%3 for caller in callers]
            batch=await asyncio.gather(*(caller.ask(index,audio[index],round_index+1,timeout) for caller,index in zip(callers,indices)))
            rows.extend(batch)
            print('Completed simultaneous round '+str(round_index+1)+': '+json.dumps(batch),flush=True)
            await asyncio.sleep(1)
        if hold_seconds:await asyncio.sleep(hold_seconds)
        assert all(caller.room.connection_state==rtc.ConnectionState.CONN_CONNECTED for caller in callers)
        maximum=max(row['first_audio_ms'] for row in rows)
        assert maximum<=latency_budget,f'First-audio latency {maximum}ms exceeds {latency_budget}ms'
        return {'gate_passed':True,'users':3,'rounds':rounds,'spoken_answers':len(rows),'separate_rooms':True,'fourth_call_status':429,'same_sessions_survived':True,'max_first_audio_ms':maximum,'latency_budget_ms':latency_budget,'startup_ms':[caller.startup_ms for caller in callers],'duration_seconds':round(time.perf_counter()-started,1),'results':rows}
    finally:
        cleanup=await asyncio.gather(*(caller.close() for caller in callers),return_exceptions=True)
        if any(isinstance(row,BaseException) for row in cleanup):raise AssertionError('Capacity gate session cleanup failed')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio',nargs=3,required=True,metavar=('JAPAN','FRANCE','ITALY'))
    parser.add_argument('--rounds',type=int,default=3)
    parser.add_argument('--latency-budget-ms',type=int,default=15000)
    parser.add_argument('--timeout',type=float,default=40)
    parser.add_argument('--hold-seconds',type=float,default=0)
    args=parser.parse_args()
    if args.rounds<1 or args.latency_budget_ms<1 or args.timeout<=0:parser.error('Gate arguments must be positive')
    print(json.dumps(asyncio.run(main(args.audio,args.rounds,args.latency_budget_ms,args.timeout,args.hold_seconds)),indent=2))
