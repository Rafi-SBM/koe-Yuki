# Personal demo hosting

Configured 30 October 2026, India time. Frontend:
[yuki-voice-agent.vercel.app](https://yuki-voice-agent.vercel.app).
An access code is required to start a live call. Credentials and the access code
are stored outside version control; the private local deployment configuration is
`.local/production-frontend.env`.

| Service | Role | Selected plan |
| --- | --- | --- |
| Vercel, `rafi-luffys-projects/yuki-voice-agent` | Next.js UI and admission APIs, Node 24 | Hobby |
| LiveKit Cloud, `voice-agent-yuki-dch7935g` | Python worker and WebRTC transport | Build |
| Upstash Redis | Shared capacity, quotas, cooldowns and readiness | Free; claimed by owner |
| Groq | Whisper transcription and GPT OSS responses | Free, confirmed by owner |

The named `yuki` worker is deployed in `ap-south` (Mumbai). Its deployment is
recorded in `agent/livekit.toml`. Kokoro synthesizes speech on that worker; no
separate TTS service or Hugging Face account is required. Langfuse is disabled.

## Staying at ₹0

Keep all four services on their free plans. No payment method or paid upgrade was
added by this deployment. Vercel Hobby is for personal, non-commercial use.
LiveKit Build includes 1,000 agent session minutes and 5,000 WebRTC participant
minutes monthly; its allowances are hard caps. Upstash Free includes 500,000
commands monthly and 256 MB storage. Groq Free has model-specific limits.
Exhausted free allowances can interrupt the demo; they are not unlimited capacity.

Current application settings allow one call at a time, up to five minutes each,
with a 100-request and 30,000-token daily provider budget. Per-minute controls are
15 requests and 6,000 reserved tokens. Provider limits still apply and can be lower.
Heartbeat traffic also consumes Redis commands.

LiveKit may scale an idle worker down. A new call explicitly dispatches it and the
browser waits up to 90 seconds for readiness before enabling its microphone.
LiveKit documents typical cold-start delays of 10–20 seconds; model initialization
and network conditions can add time. The owner accepted automatic startup to keep
the setup at ₹0. This is a personal demo without an always-warm or uptime guarantee.

`/api/live` checks the frontend. `/api/health` returns 200 only while a registered,
warmed worker has capacity and a fresh shared heartbeat; 503 while asleep or busy
is expected. Named cloud admission can start a sleeping worker even then. Consent,
access policy, shared capacity and ownership checks still apply before dispatch.

See [deployment instructions](../deploy/README.md),
[operations](OPERATIONS.md) and [verification evidence](DEPLOYMENT_VERIFICATION.md).

Plan references checked during setup:
[Vercel Hobby](https://vercel.com/docs/plans/hobby),
[LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/),
[Upstash pricing](https://upstash.com/pricing/redis),
[Groq limits](https://console.groq.com/docs/rate-limits).
