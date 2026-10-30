# Current system decisions

- LiveKit transports audio; Groq performs STT/LLM inference; Kokoro synthesizes on worker CPU.
- Server-generated rooms/identities and a signed owner cookie replace caller-chosen rooms.
- Production requires shared Redis rate/admission/quota controls. Self-hosted admission requires a warm-worker heartbeat; named LiveKit Cloud admission explicitly dispatches the worker to support automatic startup. Both retain the browser handshake before microphone capture.
- The browser waits for a worker handshake and acknowledged preferences before enabling the microphone.
- The worker waits for initial preferences before greeting; controls bind to the admitted participant.
- Mute survives reconnects and device switches; failure/cancellation/unmount share resource cleanup.
- Missing/corrupt models fail initialization, and provider/synthesis errors fail the session explicitly.
- Both STT and LLM use bounded credential failover. A partial LLM response is never replayed.
- Credentials do not multiply organization quotas. Minute and daily budgets are enforced globally in production.
- Speech and transcripts are not recorded/logged by this application; optional telemetry exports metadata only.
- Language routing includes seven speech languages. Browser preview voices differ from live Kokoro voices.
- Model hashes, Python constraints and npm lockfile pin reproducible dependencies; updates require new scans/checks.
- Release claims require strict semantic/audio gates and a hardware-specific load/soak test. Local smoke results are in docs/REMEDIATION_REPORT.md.
