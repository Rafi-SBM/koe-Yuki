"""Evaluation harness measuring STT/LLM latencies, Kokoro TTS RTF, and key pool failover."""

from __future__ import annotations

import os
import sys
import time
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List

# Ensure agent/src is on the module path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from kokoro_engine import clean_text_for_tts, detect_language_and_voice
from key_pool import GroqKeyPool, get_global_key_pool

CASES = [
    ("Could you summarize our recent conversation?", "en-us"),
    ("明日の東京の天気を教えてください。", "ja"),
    ("¿Puedes confirmar la hora de la próxima reunión?", "es"),
    ("Bonjour, pouvez-vous m'aider à configurer ce projet ?", "fr-fr"),
    ("नमस्ते, क्या आप इस दस्तावेज़ का संक्षेप प्रस्तुत कर सकते हैं?", "hi"),
    ("请问今天系统的运行状态是否正常？", "cmn"),
    ("Ciao, potresti verificare lo stato del server?", "it"),
]


async def benchmark_llm(key_pool: GroqKeyPool) -> Dict[str, Any]:
    """Measures Groq LLM Time-To-First-Token (TTFT) and throughput."""
    active_key = key_pool.get_api_key()
    client = key_pool.get_async_client(active_key)

    t0 = time.perf_counter()
    first_token_time = None
    total_tokens = 0
    full_text = ""

    try:
        stream = await client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": "You are Yuki, a real-time voice AI assistant. Answer concisely."},
                {"role": "user", "content": "Explain what WebRTC is in two short sentences."},
            ],
            stream=True,
            temperature=0.6,
            max_completion_tokens=150,
            reasoning_effort="low",
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            token_val = getattr(delta, "content", None)
            if token_val:
                if first_token_time is None:
                    first_token_time = time.perf_counter()
                total_tokens += 1
                full_text += token_val

        if not full_text.strip(): raise RuntimeError("No spoken response returned")
        total_duration = time.perf_counter() - t0
        ttft_ms = ((first_token_time - t0) * 1000) if first_token_time else 0.0
        tokens_per_sec = total_tokens / max(0.001, (total_duration - (ttft_ms / 1000)))

        return {
            "status": "passed",
            "ttft_ms": round(ttft_ms, 1),
            "total_duration_ms": round(total_duration * 1000, 1),
            "content_chunks": total_tokens,
            "content_chunks_per_second": round(tokens_per_sec, 1),
            "response": full_text.strip(),
        }
    except Exception as e:
        return {"status": "failed", "error": type(e).__name__}
    finally:
        await key_pool.aclose()


def benchmark_tts() -> Dict[str, Any]:
    """Measures Kokoro-82M ONNX synthesis latency and Real-Time Factor (RTF)."""
    repo_root = Path(__file__).parent
    model = os.getenv("KOKORO_MODEL_PATH", str(repo_root / "models/kokoro-v1.0.onnx"))
    voices = os.getenv("KOKORO_VOICES_PATH", str(repo_root / "models/voices-v1.0.bin"))

    if not (Path(model).exists() and Path(voices).exists()):
        return {"status": "skipped", "reason": "Kokoro ONNX model weights not found on disk"}

    from kokoro_engine import KokoroLiveKitTTS
    tts = KokoroLiveKitTTS(model_path=model, voices_path=voices, voice="af_bella")

    phrase = "Welcome to Yuki Voice Agent. Real-time audio synthesis is operational."
    t0 = time.perf_counter()
    samples, sr = tts._kokoro.create(phrase, voice="af_bella", speed=1.05, lang="en-us")
    cold_ms = (time.perf_counter() - t0) * 1000
    warm_times = []
    for _ in range(3):
        t0 = time.perf_counter()
        samples, sr = tts._kokoro.create(phrase, voice="af_bella", speed=1.05, lang="en-us")
        warm_times.append((time.perf_counter() - t0) * 1000)
    duration_ms = max(warm_times)
    tts._executor.shutdown(wait=True)

    audio_length_sec = len(samples) / float(sr)
    # Real-Time Factor (RTF): synthesis duration / audio duration. (RTF < 1.0 means faster than real-time)
    rtf = (duration_ms / 1000.0) / max(0.001, audio_length_sec)

    return {
        "status": "passed",
        "cold_synthesis_ms": round(cold_ms, 1),
        "warm_samples_ms": [round(value, 1) for value in warm_times],
        "synthesis_ms": round(duration_ms, 1),
        "audio_seconds": round(audio_length_sec, 2),
        "sample_rate": sr,
        "rtf": round(rtf, 3),
        "faster_than_realtime": rtf < 1.0,
    }


def benchmark_key_pool_failover() -> Dict[str, Any]:
    """Validates multi-key pool failover under simulated rate limits."""
    mock_keys = ["mock-key-alpha", "mock-key-beta", "mock-key-gamma"]
    pool = GroqKeyPool(mock_keys, default_cooldown_seconds=1.0)

    # 1. First key returned
    k1 = pool.get_api_key()
    assert k1 in mock_keys

    # 2. Mark k1 rate-limited
    pool.mark_rate_limited(k1)

    # 3. Next key returned should failover to k2
    k2 = pool.get_api_key()
    assert k2 in mock_keys and k2 != k1

    # 4. Mark k2 rate-limited
    pool.mark_rate_limited(k2)

    # 5. Next key returned should failover to k3
    k3 = pool.get_api_key()
    assert k3 in mock_keys and k3 not in (k1, k2)

    return {
        "status": "passed",
        "keys_tested": len(mock_keys),
        "failover_verified": True,
    }


def main() -> int:
    print("----------------------------------------------------------")
    print("YUKI PIPELINE SUBSYSTEM EVALUATION HARNESS")
    print("----------------------------------------------------------")

    results: Dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "subsystems": {},
    }

    # Multilingual routing verification
    failures: List[str] = []
    for text, expected_language in CASES:
        cleaned = clean_text_for_tts(text)
        detected_lang, voice = detect_language_and_voice(cleaned)
        if detected_lang != expected_language:
            failures.append(f"{text!r}: expected {expected_language}, got {detected_lang}")

    passed_count = len(CASES) - len(failures)
    results["subsystems"]["language_routing"] = {
        "total": len(CASES),
        "passed": passed_count,
        "failures": failures,
    }
    print(f"[{'FAIL' if failures else 'PASS'}] Language Routing: {passed_count}/{len(CASES)} passed")

    # Key pool failover verification
    failover_result = benchmark_key_pool_failover()
    results["subsystems"]["key_pool_failover"] = failover_result
    print(f"[PASS] Key Pool Failover: {failover_result['status'].upper()}")

    # Kokoro ONNX TTS real-time factor
    tts_result = benchmark_tts()
    results["subsystems"]["kokoro_tts"] = tts_result
    if tts_result["status"] == "passed":
        print(
            f"[PASS] Kokoro ONNX TTS: {tts_result['audio_seconds']}s audio in "
            f"{tts_result['synthesis_ms']}ms (RTF={tts_result['rtf']}, "
            f"{'real-time compliant' if tts_result['faster_than_realtime'] else 'slow'})"
        )
    else:
        print(f"[WARN] Kokoro ONNX TTS: {tts_result.get('reason', 'Skipped')}")

    # Groq LLM TTFT & throughput
    pool = get_global_key_pool()
    llm_result = asyncio.run(benchmark_llm(pool))
    results["subsystems"]["groq_llm"] = llm_result
    if llm_result["status"] == "passed":
        print(
            f"[PASS] Groq LLM (openai/gpt-oss-120b): TTFT={llm_result['ttft_ms']}ms | "
            f"{llm_result['content_chunks_per_second']} content chunks/s | Total={llm_result['total_duration_ms']}ms"
        )
    else:
        print(f"[WARN] Groq LLM: {llm_result.get('error', 'Failed')}")

    print("----------------------------------------------------------")
    print("TELEMETRY REPORT:")
    print(json.dumps(results, indent=2))
    print("----------------------------------------------------------")

    if failures or llm_result["status"] != "passed" or tts_result["status"] != "passed" or not tts_result.get("faster_than_realtime", False):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
