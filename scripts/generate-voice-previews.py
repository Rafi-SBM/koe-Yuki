"""Generate real Kokoro previews locally, without any hosted inference requests."""
import asyncio
import hashlib
import json
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'agent/src'))
from kokoro_engine import KokoroLiveKitTTS

PHRASES = {
    'English': "Hello, I'm Yuki. How can I help you today?",
    'Multilingual': "Hello, I'm Yuki. I can switch languages as we talk.",
    'Japanese': 'こんにちは、私はユキです。今日は何をお手伝いしましょうか。',
    'Spanish': 'Hola, soy Yuki. ¿Cómo puedo ayudarte hoy?',
    'French': 'Bonjour, je suis Yuki. Comment puis-je vous aider ?',
    'Hindi': 'नमस्ते, मैं युकी हूँ। मैं आपकी मदद कैसे कर सकती हूँ?',
    'Chinese': '你好，我是由纪。今天有什么可以帮助你的吗？',
    'Italian': 'Ciao, sono Yuki. Come posso aiutarti oggi?',
}

async def main():
    catalog = json.loads((ROOT / 'frontend/src/data/voice-catalog.json').read_text())
    output = ROOT / 'frontend/public/voice-previews'
    output.mkdir(parents=True, exist_ok=True)
    engine = KokoroLiveKitTTS(model_path=str(ROOT / 'agent/models/kokoro-v1.0.onnx'),
                             voices_path=str(ROOT / 'agent/models/voices-v1.0.bin'), speed=1.0)
    manifest = {}
    try:
        for group in catalog:
            for voice in group['voices']:
                voice_id = voice['id']
                engine.voice = 'af_bella' if voice_id == 'auto' else voice_id
                engine.auto_voice = voice_id == 'auto'
                text = PHRASES[voice['lang']]
                chunks = []
                async with engine.synthesize(text) as stream:
                    async for audio in stream:
                        assert audio.frame.sample_rate == 24000
                        chunks.append(audio.frame.data.tobytes())
                pcm = b''.join(chunks)
                assert len(pcm) > 4800, f'No audio for {voice_id}'
                digest = hashlib.sha256(pcm).hexdigest()
                name = f'{voice_id}-{digest[:12]}.wav'
                with wave.open(str(output / name), 'wb') as file:
                    file.setnchannels(1); file.setsampwidth(2); file.setframerate(24000)
                    file.writeframes(pcm)
                manifest[voice_id] = {'src': f'/voice-previews/{name}', 'pcmSha256': digest,
                                      'seconds': round(len(pcm) / 48000, 3), 'text': text}
                print(voice_id, manifest[voice_id]['seconds'], 'seconds', flush=True)
        hashes = [v['pcmSha256'] for v in manifest.values()]
        assert len(set(hashes)) == len(hashes), 'Two previews contain identical audio'
        (ROOT / 'frontend/src/data/voice-previews.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    finally:
        await engine.aclose()

if __name__ == '__main__':
    asyncio.run(main())
