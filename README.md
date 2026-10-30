# Yuki voice agent

Yuki combines a Next.js voice UI, LiveKit audio transport, Groq Whisper/LLM inference,
and Kokoro speech synthesis on a Python worker. It supports English, Japanese,
Mandarin Chinese, Hindi, Spanish, French, and Italian speech. Browser voice previews
use the browser's speech engine; they are not recordings of Kokoro voices.

This project has been hardened locally. Deployment still needs configured shared
controls and verification on the intended hardware. There is no guaranteed
sub-second latency, zero cost, or always-on free hosting. See
[the remediation report](docs/REMEDIATION_REPORT.md) for measured results and limits.

## Local setup

Use Python 3.11 and Node 24.15 or newer. Node 24 is the container/CI baseline.

```sh
python3.11 -m venv agent/venv
agent/venv/bin/python -m pip install -r agent/requirements-dev.txt
cp .env.example .env
# Edit .env with your LiveKit and Groq credentials. Keep it private.
agent/venv/bin/python scripts/configure-local.py
agent/download_models.sh
agent/venv/bin/python agent/src/agent.py download-files
npm --prefix frontend ci
```

Start the worker and web UI in separate terminals:

```sh
agent/venv/bin/python agent/src/agent.py dev
npm --prefix frontend run dev
```

Local development can use process-local admission when Redis is absent. Production
refuses this fallback. Local `/api/health` stays unavailable without a shared worker
heartbeat; `/api/live` checks the web process. The browser independently verifies a
worker handshake before enabling the microphone and reporting a live call.

Choose a microphone before starting, accept the processing notice, and provide an
access code if required. Mute persists across calls and device changes. Sandbox
uses microphone audio locally for visualization and does not call Groq.

## Verification

```sh
scripts/check-local.sh
# With a worker connected to the same LiveKit project:
agent/venv/bin/python agent/eval_harness.py
agent/venv/bin/python agent/tests/test_livekit_e2e.py
agent/venv/bin/python agent/tests/test_concurrency.py --users 2
agent/venv/bin/python agent/tests/test_barge_in.py
```

Live gates use synthetic speech, require the recognized question and a spoken
Tokyo answer, check settings acknowledgements, and release room/audio resources.
They fail on missing required providers/assets, silence, incorrect answers, or a
five-second first-audio budget. Two samples are a smoke test, not a reliable p95
estimate. Repeat at intended concurrency during a staging soak.

## Production

Read [the deployment guide](deploy/README.md) and [operations runbook](docs/OPERATIONS.md).
Required controls include a dedicated Redis REST database shared by frontend and
worker, an HTTPS application origin, ingress that supplies a trustworthy client IP,
a random session signing secret, and an explicit access policy. A private access
code is the default beta policy. Calls default to five minutes, one concurrent
session, and bounded per-minute/daily provider budgets. Set limits below your
actual allocation; multiple keys do not multiply an organization's quota.

Raw audio is not recorded by this application. Raw transcripts are not logged or
exported by application telemetry. Browser transcripts are held in memory (last 500
messages), clear on reload, and can be cleared/exported by the user. LiveKit and Groq
receive audio/text needed to operate the service; configure and disclose their
retention policies before launch. Optional Langfuse exports only application turn
metadata/character counts, is off by default, and filters SDK spans containing text.

No deployment or commits are performed by the local verification scripts.
