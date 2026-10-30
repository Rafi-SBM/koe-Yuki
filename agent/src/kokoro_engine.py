"""
Kokoro Multilingual ONNX Low-Latency Streaming Text-to-Speech Engine for LiveKit.
Provides native LiveKit tts.TTS integration, automatic language detection & voice routing,
multi-threaded ONNX optimization, Japanese Kanji-to-Kana G2P normalization via pykakasi,
and text sanitization for 50+ multilingual voices.
"""

import os
import re
import time
import asyncio
import logging
import unicodedata
import hashlib
from concurrent.futures import ThreadPoolExecutor
import textwrap
from typing import Optional, Tuple
import numpy as np

from livekit.agents import tts, APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS, APIError

try:
    import onnxruntime as ort
    from kokoro_onnx import Kokoro
except ImportError:
    Kokoro = None  # type: ignore
    ort = None  # type: ignore

try:
    import pykakasi
    _kakasi = pykakasi.kakasi()
except ImportError:
    _kakasi = None

logger = logging.getLogger("voice_agent.kokoro_engine")

# Multilingual default voices mapping
LANGUAGE_VOICE_MAP = {
    "ja": "jf_alpha",       # Japanese Female
    "cmn": "zf_xiaobei",     # Chinese Female
    "hi": "hf_alpha",       # Hindi Female
    "es": "ef_dora",        # Spanish Female
    "fr-fr": "ff_siwis",    # French Female
    "it": "if_sara",        # Italian Female
    "pt-br": "pf_dora",     # Portuguese Female
    "en-gb": "bf_emma",     # British English Female
    "en-us": "af_bella",    # American English Female
}

LANGUAGE_VOICE_PREFIXES = {
    "ja": ("j",), "cmn": ("z",), "hi": ("h",), "es": ("e",),
    "fr-fr": ("f",), "it": ("i",), "pt-br": ("p",),
    "en-gb": ("b",), "en-us": ("a", "b"),
}


try:
    import jaconv
except ImportError:
    jaconv = None

def convert_japanese_to_kana(text: str) -> str:
    """
    Converts Japanese Kanji, Katakana, and mixed Latin/Romaji words (like 'Yuki', 'AI', names)
    to pure phonetic Hiragana. This completely prevents espeak-ng from triggering language switches
    or reading characters as 'chinese letter' / 'japanese letter'.
    """
    if not text:
        return text

    # 1. Convert Latin/English words to Kana
    def replace_latin(match):
        word = match.group(0)
        custom_map = {
            "yuki": "ゆき",
            "ai": "えーあい",
            "ok": "おーけー",
            "pc": "ぴーしー",
            "app": "あぷり",
            "python": "ぱいそん",
            "groq": "ぐろっく",
            "livekit": "らいぶきっと",
            "stt": "えすてぃーてぃー",
            "tts": "てぃーてぃーえす",
            "san": "さん",
            "kun": "くん",
            "chan": "ちゃん",
            "sama": "さま",
        }
        lower = word.lower()
        if lower in custom_map:
            return custom_map[lower]
        if jaconv is not None:
            try:
                converted = jaconv.alphabet2kana(word)
                if converted:
                    return converted
            except Exception:
                pass
        return word

    text = re.sub(r"[A-Za-z]+", replace_latin, text)

    # 2. Convert all Kanji to pure Hiragana via pykakasi
    if _kakasi is not None:
        try:
            converted = _kakasi.convert(text)
            text = "".join(item["hira"] for item in converted)
        except Exception as e:
            logger.warning("[TTS] Japanese normalization failed (%s)", type(e).__name__)

    return text


def clean_text_for_tts(text: str) -> str:
    """
    Sanitizes and normalizes text for Kokoro phonemizer across all supported languages.
    Converts smart quotes, em-dashes, and special characters to standard punctuation
    while preserving non-Latin scripts (Japanese Hiragana/Katakana/Kanji, Chinese, Devanagari, etc.).
    """
    if not text:
        return ""
    # Normalize unicode to NFKC (preserves non-Latin scripts properly)
    text = unicodedata.normalize("NFKC", text)
    # Replace smart quotes and apostrophes
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("`", "'")
    # Replace dashes and hyphens
    text = text.replace("\u2014", ", ").replace("\u2013", ", ")
    text = text.replace("\u2011", "-").replace("\u2010", "-")
    # Remove markdown symbols (bold, italic, code, headers)
    text = re.sub(r"[*_`#~]", "", text)
    # Remove URLs
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    # Remove emojis and non-standard symbols
    text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    # Normalize multiple punctuation or spaces
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def detect_language_and_voice(text: str, default_voice: str = "af_bella") -> Tuple[str, str]:
    """
    Automatically detects the language of the text and selects the optimal Kokoro voice & language code.
    """
    # 1. Japanese (Hiragana, Katakana, or Kanji presence)
    if re.search(r"[\u3040-\u309f\u30a0-\u30ff]", text) or (
        re.search(r"[\u4e00-\u9fff]", text) and any(c in text for c in ["は", "の", "です", "ます", "に", "を", "た", "て", "い", "る", "か"])
    ):
        return ("ja", "jf_alpha")

    # 2. Chinese (CJK characters without Japanese kana)
    if re.search(r"[\u4e00-\u9fff]", text):
        return ("cmn", "zf_xiaobei")

    # 3. Hindi (Devanagari script)
    if re.search(r"[\u0900-\u097f]", text):
        return ("hi", "hf_alpha")

    tokens = set(re.findall(r"\b[\w'-]+\b", text.lower()))

    # 4. French (Distinct markers & words)
    if any(
        w in tokens
        for w in ["bonjour", "merci", "salut", "allez-vous", "suis", "enchanté", "enchante", "français", "avec", "pourquoi", "s'il", "vous", "plaît", "ceci"]
    ) or re.search(r"[àâçêëîïôûüÿœæ]", text, re.IGNORECASE):
        return ("fr-fr", "ff_siwis")

    # 5. Spanish (Distinct markers & words)
    if any(
        w in tokens
        for w in ["hola", "gracias", "buenos", "días", "dias", "estás", "estas", "amigo", "amiga", "español", "espanol"]
    ) or re.search(r"[áóúñ¿¡]", text, re.IGNORECASE):
        return ("es", "ef_dora")

    # 6. Italian (Distinct markers & words)
    if any(
        w in tokens
        for w in ["ciao", "grazie", "buongiorno", "prego", "stai", "arrivederci", "italiano", "questo", "vocale"]
    ) or re.search(r"[èéòù]", text, re.IGNORECASE):
        return ("it", "if_sara")

    # Default to English with the user-selected or default voice
    return ("en-us", default_voice)


class KokoroLiveKitTTS(tts.TTS):
    """Native LiveKit TTS adapter for Kokoro-82M ONNX with multi-lingual auto-routing."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        voices_path: Optional[str] = None,
        voice: str = "af_bella",
        speed: float = 1.05,
        sample_rate: int = 24000,
        shared_url: Optional[str] = None,
    ):
        super().__init__(
            # LiveKit Agents wraps synthesize()-only providers in its
            # StreamAdapter. Our ChunkedStream still emits progressive
            # sentence segments, but this flag must remain false until a
            # native SynthesizeStream implementation is provided.
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=1,
        )
        self.on_notice = None
        self.shared = shared_url is not None
        if shared_url is not None:
            from shared_speech import RemoteKokoro
            self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='kokoro-client')
            self._kokoro = RemoteKokoro(shared_url, os.environ['YUKI_SPEECH_TOKEN'])
            self.available_voices = self._kokoro.get_voices()
            self.voice = 'af_bella' if voice == 'auto' else voice
            self.auto_voice = voice == 'auto'
            self.speed = max(.75, min(1.5, float(speed)))
            return
        # Prioritize Kokoro v1.0 multilingual assets if present
        v1_model = "models/kokoro-v1.0.onnx"
        v1_voices = "models/voices-v1.0.bin"

        if os.path.exists(v1_model):
            self.model_path = model_path or v1_model
        elif os.path.exists("agent/" + v1_model):
            self.model_path = model_path or "agent/" + v1_model
        else:
            self.model_path = model_path or os.getenv("KOKORO_MODEL_PATH", "models/kokoro-v1.0.onnx")

        if os.path.exists(v1_voices):
            self.voices_path = voices_path or v1_voices
        elif os.path.exists("agent/" + v1_voices):
            self.voices_path = voices_path or "agent/" + v1_voices
        else:
            self.voices_path = voices_path or os.getenv("KOKORO_VOICES_PATH", "models/voices-v1.0.bin")

        expected = {self.model_path: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5", self.voices_path: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"}
        for path, checksum in expected.items():
            try:
                with open(path, "rb") as asset:
                    actual = hashlib.file_digest(asset, "sha256").hexdigest()
            except OSError as error: raise RuntimeError("Kokoro assets are missing") from error
            if actual != checksum: raise RuntimeError("Kokoro asset checksum mismatch; download verified assets")
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kokoro")
        self._kokoro = None
        self.voice = voice
        self.speed = max(0.75, min(1.5, float(speed)))
        self.auto_voice = voice == "auto"
        self.available_voices = []

        if os.path.exists(self.model_path) and os.path.exists(self.voices_path) and Kokoro is not None:
            try:
                # Configure optimized multi-threaded ONNX session
                if ort is not None:
                    sess_options = ort.SessionOptions()
                    sess_options.intra_op_num_threads = max(1, min(4, int(os.getenv("KOKORO_THREADS", "2"))))
                    sess_options.inter_op_num_threads = 1
                    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                    providers = ["CPUExecutionProvider"]
                    onnx_session = ort.InferenceSession(
                        self.model_path,
                        sess_options=sess_options,
                        providers=providers
                    )
                    self._kokoro = Kokoro.from_session(onnx_session, self.voices_path)
                else:
                    self._kokoro = Kokoro(self.model_path, self.voices_path)

                self.available_voices = self._kokoro.get_voices()
                if self.voice not in self.available_voices:
                    fallback_voice = "af_bella" if "af_bella" in self.available_voices else self.available_voices[0]
                    self.voice = fallback_voice
                logger.info(
                    f"[TTS] KokoroLiveKitTTS loaded {len(self.available_voices)} voices (active default: '{self.voice}')"
                )
            except Exception as e:
                raise RuntimeError("Kokoro model initialization failed") from e
        else:
            raise RuntimeError("Kokoro model assets or runtime are unavailable. Run download_models.sh first.")

    async def aclose(self):
        await asyncio.to_thread(self._executor.shutdown, wait=True, cancel_futures=True)
        if self.shared: self._kokoro.close()

    def synthesize(
        self,
        text: str,
        *,
        conn_options: Optional[APIConnectOptions] = None
    ) -> "KokoroChunkedStream":
        return KokoroChunkedStream(
            tts=self,
            input_text=text,
            conn_options=APIConnectOptions(max_retry=0, timeout=45 if self.shared else 15)
        )


class KokoroChunkedStream(tts.ChunkedStream):
    """Audio streaming pipeline that synthesizes multilingual text chunks to LiveKit AudioEmitter."""

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        raw_text = self.input_text.strip()
        if not raw_text:
            return

        cleaned_text = clean_text_for_tts(raw_text)
        if not cleaned_text:
            return

        # 1. Detect language and select the configured voice. "auto" is the only
        # mode that changes voice per response; an explicit voice is respected.
        lang_code, target_voice = detect_language_and_voice(
            cleaned_text,
            default_voice=("af_bella" if self._tts.auto_voice else self._tts.voice)
        )
        if not self._tts.auto_voice:
            target_voice = self._tts.voice

        # Kokoro voice packs are language-specific. If the user keeps an
        # English voice selected while speaking Japanese, use the native voice
        # for that language instead of failing the entire response.
        if not self._tts.auto_voice:
            prefixes = LANGUAGE_VOICE_PREFIXES.get(lang_code, ())
            if prefixes and not target_voice.startswith(prefixes):
                target_voice = LANGUAGE_VOICE_MAP.get(lang_code, target_voice)

        if lang_code == "en-us" and target_voice.startswith("b"): lang_code = "en-gb"

        # 2. For Japanese text, convert Kanji to pure Hiragana so phonemizer speaks natural Japanese words
        synthesize_text = cleaned_text
        if lang_code == "ja":
            synthesize_text = convert_japanese_to_kana(cleaned_text)

        # Ensure voice exists in loaded model
        if self._tts.available_voices and target_voice not in self._tts.available_voices:
            target_voice = self._tts.voice

        output_emitter.initialize(
            request_id=f"kokoro-{time.time()}",
            sample_rate=24000,
            num_channels=1,
            mime_type="audio/pcm;rate=24000",
            stream=True,
        )

        if self._tts._kokoro is None:
            raise APIError("Speech synthesis is unavailable", retryable=False)

        try:
            loop = asyncio.get_running_loop()
            if self._tts.shared:
                from provider import send_notice
                def queued(position):
                    message = f"Preparing your voice reply. {position} {'other reply is' if position == 1 else 'other replies are'} ahead." if position else None
                    asyncio.run_coroutine_threadsafe(send_notice(self._tts.on_notice, message), loop)
                self._tts._kokoro.on_wait = queued
            # Kokoro's ONNX API returns a complete waveform per call. Segmenting
            # at sentence boundaries lets LiveKit start playback as soon as the
            # first segment is ready instead of waiting for the whole answer.
            chunks = [c.strip() for c in re.split(r"(?<=[.!?。！？])\s*", synthesize_text) if c.strip()]
            if not chunks:
                chunks = [synthesize_text]
            bounded_chunks = []
            for chunk in chunks:
                bounded_chunks.extend(textwrap.wrap(chunk, width=160, break_long_words=True, break_on_hyphens=False))
            for index, chunk in enumerate(bounded_chunks):
                samples, sr = await loop.run_in_executor(
                    self._tts._executor,
                    lambda chunk=chunk: self._tts._kokoro.create(
                        chunk,
                        voice=target_voice,
                        speed=self._tts.speed,
                        lang=lang_code
                    )
                )
                if sr != 24000 or len(samples) == 0 or not np.all(np.isfinite(samples)) or not np.any(np.abs(samples) > 1e-5): raise ValueError("Invalid or silent synthesis output")
                output_emitter.start_segment(segment_id=f"segment-{index}")
                int16_data = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                output_emitter.push(int16_data)
                output_emitter.end_segment()
            output_emitter.end_input()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("[TTS] Synthesis failed (%s)", type(e).__name__)
            raise APIError("Speech synthesis failed", retryable=False) from None
