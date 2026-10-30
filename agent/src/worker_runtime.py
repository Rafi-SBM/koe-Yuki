"""Start shared speech before the SDK launches any job processes."""
import os
import secrets
from livekit.agents import AgentServer

class YukiAgentServer(AgentServer):
    speech_service = None

    @property
    def speech_ready(self):
        return self.speech_service is not None and self.speech_service.ready

    async def run(self, *, devmode=False, unregistered=False):
        try:
            if os.getenv('YUKI_SHARED_SPEECH') == 'true':
                from shared_speech import SharedSpeechService
                token = os.environ.setdefault('YUKI_SPEECH_TOKEN', secrets.token_urlsafe(32))
                self.speech_service = SharedSpeechService(token)
                await self.speech_service.start()
                os.environ['YUKI_SPEECH_URL'] = f'http://127.0.0.1:{self.speech_service.port}'
            await super().run(devmode=devmode, unregistered=unregistered)
        finally:
            if self.speech_service: await self.speech_service.aclose()
