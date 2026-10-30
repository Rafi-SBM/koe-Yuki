"""Real frontend admission for synthetic voice gates; never bypass the lease boundary."""
import os
from dataclasses import dataclass
import aiohttp

@dataclass
class Admission:
    client: aiohttp.ClientSession
    origin: str
    token: str
    server_url: str
    room: str
    identity: str
    lease: str

    async def aclose(self):
        try:
            async with self.client.post(self.origin+'/api/session/end',headers={'Origin':self.origin},json={'lease':self.lease}) as response:
                if response.status!=200: raise RuntimeError(f'Session cleanup failed (HTTP {response.status})')
        finally: await self.client.close()

async def admit_session():
    origin=os.getenv('YUKI_TEST_ORIGIN','http://localhost:3000').rstrip('/')
    client=aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
    try:
        async with client.post(origin+'/api/token',headers={'Origin':origin},json={'consent':True,'accessCode':os.getenv('YUKI_TEST_ACCESS_CODE','')}) as response:
            if response.status!=200: raise RuntimeError(f'Frontend admission failed (HTTP {response.status}); verify readiness, access policy and configured capacity')
            data=await response.json()
        return Admission(client,origin,data['token'],data['serverUrl'],data['roomName'],data['participantName'],data['lease'])
    except BaseException:
        await client.close()
        raise
