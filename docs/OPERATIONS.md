# Yuki operations runbook

Use an operator-owned HTTPS readiness monitor for /api/health, not /api/live.
/api/live indicates only the web process is alive. /api/health returns 503 for
missing production controls, unavailable shared state, or no ready/accepting
worker heartbeat. A model checksum or prewarm failure prevents the worker from
accepting jobs. Monitor provider errors and daily budget rejections separately:
a ready worker is not proof that Groq is currently answering.

The current hosted admission limit is three, with one shared speech model per
worker. Do not raise it to five without repeating the capacity gate. Provider and
speech queues are bounded and cancel abandoned waits; a queue notice should keep
the existing call connected. A fourth caller receives a capacity response.
If a process crashes, provider slots expire within 30 seconds, abandoned waiters
within 60 seconds, and readiness within 45 seconds. The call's signed deadline
still limits the session. Shared store failures must fail closed.

Scrape worker port 9090/metrics internally. The SDK uses a multiprocess registry
for worker/job metrics. Logs include subsystem durations, utterance character
counts and user-to-agent state transitions; no raw application transcripts.
Reported turn_ms starts at SDK end-of-speech detection and ends when playback
starts on the worker. The synthetic gate separately measures user source end to
first non-silent audio received by a client. Those clocks differ; do not combine
or label either as an API ping.

Alert when readiness fails twice in a minute, a synthetic conversation fails,
p95 first audio exceeds the configured release budget, provider errors persist,
daily quota approaches its cap, or memory/CPU exceed tested limits. Set actual
monitor destinations and on-call ownership in the hosting platform. The repository
contains probe and alert templates; it cannot configure an account it does not have.

For an incident:

1. Set ALLOW_NEW_SESSIONS=false on all frontends to stop new admission.
2. Preserve sanitized logs and the image/version identifier. Do not attach dotenv,
   JWTs or raw user speech/transcripts to incident reports.
3. Check model readiness, heartbeat TTL/store connectivity, LiveKit registration,
   CPU/memory, model quotas and provider status. Extra keys do not resolve an
   organization quota ceiling. Cooling credentials are never immediately retried.
4. For a bad release, drain the current worker (up to the maximum call duration),
   replace it with the last verified compatible image, restore frontend image/config,
   and run a synthetic Tokyo-answer call. Retain signing secret/Redis DB while
   healthy leases drain. Frontend and worker must agree on session/control contracts.
5. Restore admission only after readiness and synthetic gates pass.

Established calls expire at their server-owned deadline (300 seconds default,
900 maximum) and close after 120 seconds without user activity. Token validity is
2 minutes for initial joining; expiry alone does not terminate an established call.
Owner cleanup deletes the room before releasing its lease. When cleanup/store calls
fail, the signed deadline and lease expiry provide a bounded fallback. A new-session
kill switch does not forcibly terminate existing sessions; use LiveKit room deletion
as an explicit incident response if necessary.

Retention: keep application logs only for an operator-defined short diagnostic
window, restrict access, and configure deletion. Langfuse is optional and off by
default; only voice.turn metadata is exported, SDK text spans are filtered out.
Verify provider retention/data-processing terms for the actual accounts and region
before public launch. The UI processing notice describes the application's data
flow but cannot assert a provider retention setting that has not been configured.
