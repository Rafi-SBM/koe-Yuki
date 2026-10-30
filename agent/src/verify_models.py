"""Synthesize every advertised language through the real LiveKit TTS adapter."""
import asyncio
import json
import numpy as np
from kokoro_engine import KokoroLiveKitTTS, detect_language_and_voice

CASES = {
    'en-us':'Hello, how can I help you today?',
    'ja':'こんにちは、今日は何をお手伝いしましょうか。',
    'cmn':'你好，今天过得怎么样？',
    'hi':'नमस्ते, मैं आपकी मदद कर सकती हूँ।',
    'es':'Hola, buenos días, ¿cómo estás?',
    'fr-fr':'Bonjour, comment allez-vous aujourd’hui ?',
    'it':'Buongiorno, come stai oggi?',
}
async def main():
    engine=KokoroLiveKitTTS(voice='auto');results={}
    try:
        for language,text in CASES.items():
            assert detect_language_and_voice(text)[0]==language, f'Incorrect routing: {language}'
            samples=0;peak=0
            async with engine.synthesize(text) as stream:
                async for audio in stream:
                    frame=audio.frame
                    assert frame.sample_rate==24000 and frame.num_channels==1
                    pcm=np.frombuffer(frame.data,dtype=np.int16)
                    samples+=len(pcm);peak=max(peak,int(np.max(np.abs(pcm.astype(np.int32)))))
            assert samples>2400 and peak>100, f'Empty or silent audio: {language}'
            results[language]={'samples':samples,'sample_rate':24000,'non_silent':True}
        print(json.dumps({'passed':True,'languages':results},indent=2))
    finally: await engine.aclose()
if __name__=='__main__': asyncio.run(main())
