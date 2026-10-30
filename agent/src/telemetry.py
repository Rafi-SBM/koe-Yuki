"""Optional Langfuse observability for voice turns."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("voice_agent.telemetry")


class VoiceObservability:
    """Telemetry manager for voice session tracking with fail-open guarantees."""

    def __init__(self, room_name: str):
        self.room_name = room_name
        self.langfuse_client = None
        self.langfuse_host = os.getenv("LANGFUSE_HOST") or os.getenv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com")

        # Initialize Langfuse client if credentials are configured
        pub_key = os.getenv("LANGFUSE_PUBLIC_KEY")
        sec_key = os.getenv("LANGFUSE_SECRET_KEY")
        if os.getenv("TELEMETRY_ENABLED") == "true" and pub_key and sec_key:
            try:
                from langfuse import Langfuse
                self.langfuse_client = Langfuse(
                    public_key=pub_key,
                    secret_key=sec_key,
                    host=self.langfuse_host,
                    should_export_span=lambda span: span.name.startswith("voice.turn."),
                )
                logger.info("[OBS] Langfuse primary telemetry active (host=%s, room=%s)", self.langfuse_host, room_name)
            except Exception:
                logger.warning("[OBS] Langfuse init failed; continuing fail-open")
        else:
            logger.info("[OBS] Langfuse idle (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not configured)")

    @property
    def langfuse_enabled(self) -> bool:
        return self.langfuse_client is not None

    def record_turn(
        self,
        sender: str,
        text: str,
        latency_ms: Optional[int] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Record an utterance asynchronously to active observability sinks."""
        if not text:
            return

        payload_metadata = {
            "room": self.room_name,
            "sender": sender,
            "timestamp": time.time(),
        }
        if latency_ms is not None:
            payload_metadata["turn_latency_ms"] = latency_ms
        if extra_metadata:
            payload_metadata.update(extra_metadata)

        # Dispatch span to Langfuse
        if self.langfuse_client:
            try:
                observation = self.langfuse_client.start_observation(
                    name=f"voice.turn.{sender}",
                    as_type="span",
                    input={"characters": len(text)},
                    metadata=payload_metadata,
                )
                observation.update(output={"characters": len(text)})
                observation.end()
            except Exception:
                logger.debug("[OBS] Failed to record Langfuse span")

    def record_metric(self, subsystem: str, duration_seconds: float) -> None:
        if not self.langfuse_client: return
        try:
            observation = self.langfuse_client.start_observation(name="voice.turn.metrics", as_type="span", metadata={"subsystem": subsystem, "duration_seconds": duration_seconds})
            observation.end()
        except Exception: logger.debug("Metadata telemetry unavailable")

    def flush(self) -> None:
        """Flush queued spans on worker shutdown."""
        if self.langfuse_client:
            try:
                self.langfuse_client.flush()
            except Exception:
                logger.debug("[OBS] Langfuse flush failed")

    def get_status(self) -> Dict[str, Any]:
        return {
            "langfuse": {
                "enabled": self.langfuse_enabled,
                "host": self.langfuse_host if self.langfuse_enabled else None,
                "primary": True,
            },
        }


# Backward compatibility alias
LangfuseTelemetry = VoiceObservability
