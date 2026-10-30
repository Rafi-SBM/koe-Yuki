"""
LiveKit Real-Time Voice Agent Worker: Yuki
Integrates Silero VAD v5, StreamAdapted Groq Whisper Large v3 STT, Multi-Key Groq LLM (openai/gpt-oss-120b), and Streaming Kokoro ONNX TTS.
"""

import os
import io
import sys
import time
import json
import asyncio
import logging
import math
import re
import httpx
import groq as groq_client
from typing import Optional
import numpy as np
import soundfile as sf
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
if len(sys.argv) > 1 and sys.argv[1] == "start":
    os.environ["YUKI_ENV"] = "production"
# Must precede SDK/prometheus imports so child metric values use shared mmap files.
os.environ.setdefault("PROMETHEUS_MULTIPROC_DIR", "/tmp/yuki-prometheus")
if "download-files" not in sys.argv:
    os.makedirs(os.environ["PROMETHEUS_MULTIPROC_DIR"], exist_ok=True)

from livekit import rtc, api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    JobRequest,
    WorkerOptions,
    AgentServer,
    cli,
    llm,
    stt,
    utils,
    APIConnectOptions,
    APIError,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.agent_session import SessionConnectOptions
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import silero, groq

from key_pool import get_global_key_pool, PoolUnavailable
from provider import PooledGroqLLM, next_key, failed_key, retryable, provider_notice, send_notice
from shared_store import ProviderBudgetExceeded, provider_budget, start_worker_heartbeat, room_is_admitted
from prompts import YUKI_VOICE_SYSTEM_PROMPT, YUKI_GREETING
from kokoro_engine import KokoroLiveKitTTS
from knowledge import LocalKnowledgeBase
from telemetry import LangfuseTelemetry
from runtime_metrics import get_runtime_metrics
from lifecycle import end_session

# The SDK configures one structured handler for each worker process.
logger = logging.getLogger("voice_agent.yuki")

SUPPORTED_VOICES = {
    "auto", "af_bella", "af_sarah", "am_adam", "am_michael", "bf_emma", "bm_george",
    "jf_alpha", "jf_gongitsune", "jm_kumo", "ef_dora", "em_alex", "ff_siwis",
    "hf_alpha", "hm_omega", "zf_xiaobei", "zm_yunjian", "if_sara",
}


class GroqWhisperSTT(stt.STT):
    """Low-latency Groq Whisper REST STT adapter with multi-key pool failover and bounded retry."""

    def __init__(self, model: str = "whisper-large-v3", language: Optional[str] = None):
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False),
        )
        self._model = model
        self._language = language
        self._key_pool = get_global_key_pool()
        self.on_notice = None

    async def _recognize_impl(self, buffer, *, language=None, conn_options=None):
        try:
            async with asyncio.timeout(20):
                return await self._recognize_bounded(buffer, language=language, conn_options=conn_options)
        except asyncio.CancelledError: raise
        except (APIError, groq_client.APIError, httpx.TransportError, TimeoutError, PoolUnavailable) as error:
            logger.warning('Speech recognition paused (%s; reason=%s)', type(error).__name__, getattr(error, 'reason', 'provider'))
            await send_notice(self.on_notice, provider_notice(error))
            return stt.SpeechEvent(type=stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives=[])
        except Exception as error:
            raise APIError("Speech recognition is temporarily unavailable", retryable=False) from error

    async def _recognize_bounded(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: Optional[str] = None,
        conn_options: Optional[object] = None
    ) -> stt.SpeechEvent:
        frame = utils.merge_frames(buffer)
        if frame.samples_per_channel / frame.sample_rate > 30: raise ProviderBudgetExceeded('speech_length')
        pcm_bytes = frame.data.tobytes()
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        # Downmix stereo to mono if needed
        if frame.num_channels > 1:
            samples = samples.reshape(-1, frame.num_channels).mean(axis=1)

        # Ignore tiny noise blips under 80ms
        if len(samples) < int(frame.sample_rate * 0.08):
            return stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[]
            )

        bio = io.BytesIO()
        sf.write(bio, samples, frame.sample_rate, format="WAV")
        bio.name = "audio.wav"

        max_attempts = min(3, max(1, self._key_pool.total_keys))
        last_error = None

        for attempt in range(max_attempts):
            active_key = await next_key(self._key_pool)
            client = self._key_pool.get_async_client(active_key)
            await provider_budget(self._model, 0)

            try:
                bio.seek(0)
                kwargs = {
                    "file": bio,
                    "model": self._model,
                    "temperature": 0.0,
                }
                target_lang = language or self._language
                if target_lang:
                    kwargs["language"] = target_lang

                t_start = time.perf_counter()
                tr = await asyncio.wait_for(client.audio.transcriptions.create(**kwargs), timeout=6)
                stt_duration_ms = (time.perf_counter() - t_start) * 1000
                text = tr.text.strip()
                if text:
                    logger.info("[STT] Completed in %.1fms, %d characters", stt_duration_ms, len(text))
                return stt.SpeechEvent(
                    type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    alternatives=[
                        stt.SpeechData(
                            text=text,
                            language=target_lang or "auto",
                            confidence=1.0,
                        )
                    ] if text else []
                )
            except Exception as e:
                last_error = e
                logger.warning("[STT] Provider attempt %d failed (%s)", attempt + 1, type(e).__name__)
                await failed_key(self._key_pool, active_key, e)
                if not retryable(e): break
        raise APIError("Speech recognition is temporarily unavailable", retryable=False) from None

    async def aclose(self):
        await self._key_pool.aclose()


def prewarm(proc: JobProcess):
    """Preloads Silero VAD into memory for instant process initialization."""
    logger.info("[INIT] Prewarming agent process: loading Silero VAD...")
    get_runtime_metrics()
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.25,
    )
    get_global_key_pool()  # Missing credentials fail initialization.
    proc.userdata["tts"] = KokoroLiveKitTTS(voice="auto", speed=1.05)
    # Load phonemizer dictionaries and exercise actual inference before admission.
    engine = proc.userdata["tts"]
    samples, rate = engine._kokoro.create("Hello.", voice="af_bella", lang="en-us")
    if rate != 24000 or len(samples) == 0: raise RuntimeError("TTS prewarm failed")
    logger.info("[INIT] VAD and TTS are ready.")


async def request_job(request: JobRequest):
    if await room_is_admitted(request.room.name):
        await request.accept()
        return
    await request.reject()
    if not re.fullmatch(r'yuki-[0-9a-f-]{36}', request.room.name): return
    # A released bearer token must not recreate a billable guest-only room.
    service = api.LiveKitAPI(os.getenv('LIVEKIT_URL'), os.getenv('LIVEKIT_API_KEY'), os.getenv('LIVEKIT_API_SECRET'))
    try:
        await asyncio.wait_for(service.room.delete_room(api.DeleteRoomRequest(room=request.room.name)), timeout=5)
    except Exception as error:
        logger.warning('Rejected room cleanup failed (%s)', type(error).__name__)
    finally: await service.aclose()

async def entrypoint(ctx: JobContext):
    """Main lifecycle entrypoint executed upon agent assignment to a LiveKit room."""
    logger.info(f"[ROOM] Agent worker connecting to room: {ctx.room.name}...")
    if not await room_is_admitted(ctx.job.room.name):
        await end_session(ctx, None, 'admission expired')
        return
    telemetry = LangfuseTelemetry(ctx.room.name)

    async def _flush_observability():
        await asyncio.to_thread(telemetry.flush)

    ctx.add_shutdown_callback(_flush_observability)
    
    # Connect to room with audio-only subscription
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    @ctx.room.on("track_subscribed")
    def _on_track_subscribed(track, publication, participant):
        logger.info("[ROOM] subscribed track kind=%s source=%s participant=%s", track.kind, publication.source, participant.identity)

    # Prewarmed VAD instance
    vad_instance = ctx.proc.userdata.get("vad") or silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.25,
    )

    # Groq multi-key pool provider
    key_pool = get_global_key_pool()
    logger.info(f"[KEYS] Active Groq key pool loaded with {key_pool.total_keys} key(s)")

    # Multilingual STT engine
    groq_stt_raw = GroqWhisperSTT(model="whisper-large-v3", language=None)
    stt_engine = stt.StreamAdapter(stt=groq_stt_raw, vad=vad_instance)

    # LLM inference engine
    llm_engine = PooledGroqLLM(key_pool)
    tts_engine = ctx.proc.userdata["tts"]
    tts_engine.voice = "af_bella"
    tts_engine.auto_voice = True
    tts_engine.speed = 1.05
    response_style = "concise"
    style_guidance = {
        "concise": "Keep spoken answers tight: lead with the answer and use at most a few short sentences unless detail is requested.",
        "balanced": "Use a helpful balance of context and brevity. Explain the key tradeoff, then stop unless the user asks for more.",
        "detailed": "Give thorough, structured explanations while staying natural for speech. Use short sections and concrete examples.",
    }

    knowledge = LocalKnowledgeBase(os.getenv("KNOWLEDGE_DIR", "agent/knowledge"))

    @llm.function_tool(description="Search Yuki's local Markdown knowledge base for relevant context.")
    async def search_local_knowledge(query: str) -> str:
        """Search local project notes and return the best matching excerpts."""
        hits = knowledge.search(query)
        if not hits:
            return "No matching local notes found."
        return "\n\n".join(f"[{hit['source']}]\n{hit['content']}" for hit in hits)

    @llm.function_tool(description="Return the current date and time in the agent's configured timezone.")
    def get_current_time() -> str:
        """Return an ISO timestamp for time-sensitive conversation."""
        return time.strftime("%Y-%m-%dT%H:%M:%S%z")

    agent = Agent(
        instructions=YUKI_VOICE_SYSTEM_PROMPT,
        tools=[search_local_knowledge, get_current_time],
    )

    remote_participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=20)
    try:
        admission = json.loads(remote_participant.metadata or "{}")
        deadline = float(admission["deadline"])
        if admission.get("consent") is not True or not math.isfinite(deadline): raise ValueError()
    except (ValueError, TypeError, KeyError):
        await ctx.room.disconnect()
        return
    maximum = max(60, min(900, int(os.getenv("MAX_SESSION_SECONDS", "300"))))
    seconds_remaining = min(maximum, (deadline - time.time() * 1000) / 1000)
    if seconds_remaining <= 0:
        await ctx.room.disconnect()
        return
    owner = remote_participant.identity
    session_ready = False
    preferences_ready = asyncio.Event()
    async def publish(message, reliable=True):
        await ctx.room.local_participant.publish_data(json.dumps({"protocol": "yuki.control.v1", **message}), reliable=reliable, topic="yuki.control", destination_identities=[owner])
    async def notify_provider(message):
        await publish({"type": "notice", "message": message})
    llm_engine.on_notice = notify_provider
    groq_stt_raw.on_notice = notify_provider
    tasks = set()
    def spawn(coro):
        task = asyncio.create_task(coro)
        tasks.add(task)
        def finished(task):
            tasks.discard(task)
            if not task.cancelled() and task.exception(): logger.warning("Background operation failed (%s)", type(task.exception()).__name__)
        task.add_done_callback(finished)
    async def shutdown_tasks():
        for task in tuple(tasks): task.cancel()
        await asyncio.gather(*tuple(tasks), return_exceptions=True)
        await llm_engine.aclose()
        await groq_stt_raw.aclose()
        await tts_engine.aclose()
    ctx.add_shutdown_callback(shutdown_tasks)

    # Dynamic runtime control packet listener
    async def _handle_control(packet):
        nonlocal response_style
        if packet.participant is None or packet.participant.identity != owner or packet.topic != "yuki.control" or len(packet.data) > 4096: return
        try:
            message = json.loads(packet.data.decode("utf-8"))
        except (AttributeError, UnicodeDecodeError, json.JSONDecodeError):
            return
        if not isinstance(message, dict) or message.get("protocol") != "yuki.control.v1":
            return
        kind = message.get("type")
        request_id = message.get("id")
        if not isinstance(request_id, str) or len(request_id) > 100: return
        if kind == "hello":
            if session_ready: await publish({"type": "ready", "id": request_id})
            return
        if kind == "ping":
            try:
                await publish({"type": "pong", "id": request_id}, reliable=False)
            except Exception:
                logger.debug("[CONTROL] Could not reply to ping", exc_info=True)
            return
        if kind != "settings" or not session_ready:
            return
        voice = str(message.get("voice", "auto"))
        if voice not in SUPPORTED_VOICES:
            logger.warning("Ignoring unsupported voice setting: %s", voice)
            return
        speed = message.get("speed")
        style = message.get("responseStyle")
        if isinstance(speed, bool) or not isinstance(speed, (float, int)) or not math.isfinite(speed) or not 0.75 <= speed <= 1.5 or style not in style_guidance: return
        tts_engine.voice = voice
        tts_engine.auto_voice = voice == "auto"
        requested_style = message.get("responseStyle", response_style)
        if requested_style in style_guidance:
            response_style = requested_style
            try:
                await agent.update_instructions(
                    f"{YUKI_VOICE_SYSTEM_PROMPT}\n\nCurrent response style preference: {style_guidance[response_style]}"
                )
            except RuntimeError:
                # Defer update if session state is transitioning
                logger.debug("[CONTROL] response-style update deferred until session is active")
                return
        tts_engine.speed = float(speed)
        await publish({"type": "settings_ack", "id": request_id, "voice": voice, "speed": speed, "responseStyle": response_style})
        preferences_ready.set()

    def _on_control(packet):
        if len(tasks) < 32: spawn(_handle_control(packet))

    ctx.room.on("data_received", _on_control)

    # Initialize voice agent session
    session = AgentSession(
        vad=vad_instance,
        stt=stt_engine,
        llm=llm_engine,
        tts=tts_engine,
        user_away_timeout=120,
        conn_options=SessionConnectOptions(stt_conn_options=APIConnectOptions(max_retry=0, timeout=20), llm_conn_options=APIConnectOptions(max_retry=0, timeout=20), tts_conn_options=APIConnectOptions(max_retry=0, timeout=15), max_unrecoverable_errors=0),
        turn_handling={
            "endpointing": {"min_delay": 0.1},
            "interruption": {"enabled": True, "min_duration": 0.2},
        },
    )

    # Observability and transcript broadcast listeners
    @session.on("conversation_item_added")
    def _on_item_added(ev):
        item = ev.item
        if not hasattr(item, "role"):
            return
        sender = "user" if item.role == "user" else "agent"
        text = getattr(item, "text_content", None) or getattr(item, "content", "")
        if isinstance(text, list):
            text = " ".join([str(t) for t in text])
        text = str(text).strip()
        if text:
            logger.info("[TRANSCRIPT] sender=%s characters=%d", sender, len(text))
            telemetry.record_turn(sender, text)
            try:
                spawn(publish({"type": "transcript", "sender": sender, "text": text[:12000]}))
            except Exception as e:
                logger.debug(f"[DATA] Broadcast error: {e}")

    @session.on("user_state_changed")
    def _on_user_state(ev):
        nonlocal user_speech_ended_at
        if ev.new_state == "speaking": user_speech_ended_at = 0.0
        if ev.old_state == "speaking" and ev.new_state != "speaking": user_speech_ended_at = time.perf_counter()
        logger.info(f"[STATE: User] -> {ev.new_state}")
        if ev.new_state == "away":
            async def idle_end():
                await session.aclose()
                from livekit import api
                await ctx.api.room.delete_room(api.DeleteRoomRequest(room=ctx.room.name))
            spawn(idle_end())

    user_speech_ended_at = 0.0

    @session.on("agent_state_changed")
    def _on_agent_state(ev):
        nonlocal user_speech_ended_at
        logger.info(f"[STATE: Yuki] -> {ev.new_state}")
        if str(ev.new_state).lower() == "speaking" and user_speech_ended_at > 0:
            turn_latency_ms = max(1, round((time.perf_counter() - user_speech_ended_at) * 1000))
            user_speech_ended_at = 0.0
            get_runtime_metrics().turn_latency.observe(turn_latency_ms / 1000)
            telemetry.record_metric("turn", turn_latency_ms / 1000)
            logger.info(f"[TELEMETRY] Turn turnaround latency: {turn_latency_ms}ms")
            try:
                spawn(publish({"type": "telemetry", "turn_ms": turn_latency_ms}, reliable=False))
            except Exception:
                pass

    @session.on("metrics_collected")
    def on_metrics(event):
        metrics = event.metrics
        name = type(metrics).__name__
        duration = getattr(metrics, "duration", 0.0)
        subsystem = {"STTMetrics": "stt", "LLMMetrics": "llm", "TTSMetrics": "tts"}.get(name)
        if subsystem:
            get_runtime_metrics().duration.labels(subsystem=subsystem).observe(duration)
            telemetry.record_metric(subsystem, duration)
        if name == "LLMMetrics":
            get_runtime_metrics().tokens.labels(kind="input").inc(getattr(metrics, "prompt_tokens", 0))
            get_runtime_metrics().tokens.labels(kind="output").inc(getattr(metrics, "completion_tokens", 0))
        if subsystem: logger.info("[METRICS] type=%s duration=%.3f", name, duration)

    @session.on("error")
    def on_error(event):
        if not getattr(event.error, "recoverable", False):
            get_runtime_metrics().errors.inc()
            async def fail():
                try: await asyncio.wait_for(publish({"type": "error"}), timeout=3)
                finally: await end_session(ctx, session, 'pipeline failure')
            spawn(fail())

    room_options = RoomOptions(participant_identity=owner)
    await session.start(agent, room=ctx.room, room_options=room_options, record=False)
    session_ready = True
    logger.info("[SESSION] Yuki voice session actively running in room.")
    async def expire():
        await asyncio.sleep(seconds_remaining)
        await end_session(ctx, session, 'session deadline')
    spawn(expire())
    async def close_session(): await session.aclose()
    ctx.add_shutdown_callback(close_session)

    # Greet participant on join
    await asyncio.wait_for(preferences_ready.wait(), timeout=20)
    await session.say(YUKI_GREETING, allow_interruptions=True)
    logger.info("[SESSION] Yuki greeting dispatched.")


if __name__ == "__main__":
    server = AgentServer.from_server_options(
        WorkerOptions(
            agent_name=os.getenv("LIVEKIT_AGENT_NAME", ""),
            entrypoint_fnc=entrypoint,
            request_fnc=request_job,
            prewarm_fnc=prewarm,
            # One warm process keeps free-tier deployments light; LiveKit can
            # add processes under load and replicas handle horizontal scale.
            num_idle_processes=max(1, int(os.getenv("AGENT_IDLE_PROCESSES", "1"))),
            initialize_process_timeout=90.0,
            port=int(os.getenv("PORT", "8081")),
            shutdown_process_timeout=20.0,
            drain_timeout=360.0,
            prometheus_port=int(os.getenv("PROMETHEUS_PORT", "9090")),
            prometheus_multiproc_dir=os.getenv("PROMETHEUS_MULTIPROC_DIR", "/tmp/yuki-prometheus"),
        )
    )
    server.on("worker_started", lambda: start_worker_heartbeat(server))
    cli.run_app(server)
