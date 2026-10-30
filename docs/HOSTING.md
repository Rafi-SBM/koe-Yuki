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

Current application settings allow three calls at a time, up to five minutes each,
with a 100-request and 30,000-token daily provider budget. Per-minute controls are
15 requests and 6,000 reserved tokens. Provider limits still apply and can be lower.
These are shared allowances, not per-caller budgets. A typical spoken question
uses one transcription request and one response request. Heartbeat traffic also
consumes Redis commands: two commands every 15 seconds while the worker is awake,
about 346,000 commands in a continuously awake 30-day month.

The worker shares one Kokoro model across job processes and schedules speech
chunks in FIFO order. Redis also queues provider requests per model. This improves
resource use without another paid service. The three-user gate must pass before
raising admission; five slots remain closed. See [capacity evidence](CAPACITY_VERIFICATION.md).

Conversation requests retain instructions and complete recent turns within a
bounded input reservation. Temporary provider limits pause replies with a notice
instead of disconnecting the call; later turns can retry when the allowance resets.
Daily caps and the five-minute call deadline remain enforced. Voice previews are
18 distinct, locally generated Kokoro samples served as static audio by Vercel;
playing them needs no Groq request or worker session.

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

Extra Gmail addresses do not provide an approved way to multiply free allowances.
[Upstash terms](https://upstash.com/trust/terms) allow one free account per person
or legal entity. Groq limits apply to the organization, and its
[service agreement](https://console.groq.com/docs/legal/services-agreement)
prohibits use intended to avoid fees. LiveKit shares allowances across a user's
free projects. [Vercel fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines)
prohibit circumventing usage limits. No additional accounts were created.
