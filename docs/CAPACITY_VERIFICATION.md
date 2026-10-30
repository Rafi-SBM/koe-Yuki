# Three-caller capacity verification

Verified 30 October 2026 against the hosted Mumbai worker and then
[the production site](https://yuki-voice-agent.vercel.app).
Production admission now allows **three simultaneous callers**. Five slots remain
closed. All four existing services remain on their free plans; no extra account,
payment method, paid service or separate speech host was added.

## Changes

One parent-owned, checksum-verified Kokoro model serves the job processes over
authenticated loopback HTTP. The model and voice assets are unchanged. A bounded
FIFO queue handles one chunk per caller, with a 160-character chunk maximum.
Only fixed public greetings are cached; voice, speed and language are part of the
cache key. Private answers are never cached. Idle job processes are disabled.

Redis FIFO slots serialize Groq requests per model across job processes and worker
replicas. Cancellation removes waiting entries; leases recover abandoned holders.
The existing shared minute/day budgets still apply. Recognition, response and
speech notices are tracked separately in the UI. A successful speech update cannot
erase an AI allowance notice. Prompts and retained context are bounded to reduce
input reservations. Speech and provider waits have explicit timeouts.

Readiness renews every 15 seconds with a 45-second expiry. Two heartbeat commands
per interval use about 346,000 commands in a continuously awake 30-day month,
before calls and queue traffic. This fits below Upstash Free's 500,000-command
allowance; actual traffic and provider limits still need monitoring.

## Gates

Production stayed at one slot during the first gate. A private HTTPS localhost
frontend ran the production build with the same real shared admission controls,
three slots, and the deployed worker. No provider quota counters were cleared.
After that gate passed, the encrypted Vercel capacity setting changed to three,
the frontend was deployed, and the production gate passed.

| Check | Result |
| --- | --- |
| Frontend type checking, lint, production build | Passed locally and deployed on Vercel |
| Frontend regressions | 30 passed |
| Python regressions | 27 tests and 4 subtests passed; live Redis integration separately passed |
| Real Redis FIFO/cancellation | Passed with isolated test-only queue keys |
| Shared model / voice cache / authentication / cancellation | Passed offline with three clients and one model instance |
| Staging: three callers, three simultaneous rounds | Nine correct spoken answers; all three sessions survived; 89 seconds total |
| Staging first non-silent answer audio | 2,583–4,971 ms after question end |
| Production: three callers, one simultaneous round | Three correct spoken answers; all three sessions survived |
| Production first non-silent answer audio | 2,833–4,997 ms after question end |
| Room isolation | Separate cookies, room/participant identities, selected voices and audio tracks; questions rotated across rooms |
| Fourth caller | Rejected with HTTP 429 specifically for capacity, in both gates |
| Browser | Consent, preferences focus/Escape, failure notice, local microphone cleanup, mobile width and reduced motion passed |

The questions asked for the capitals of Japan, France and Italy. Callers selected
Bella, Adam and Emma. The gate requires a recognized question, the correct answer,
non-silent audio, no other caller's answer, and completed playback. Its release
budget is 15 seconds to first answer audio under three-way contention; every
observed answer was also below five seconds. These small samples are not a p95
estimate or a latency guarantee.

Startup included process scheduling and greetings: 12–45 seconds in staging.
This remains within the browser's 90-second startup window. Cold starts can add
delay. Tests use synthetic speech; long-running load, long monologues, five
concurrent callers and physical mobile microphones were not certified.

The cloud resource endpoint returned pre-test timestamps during the active gates.
Those snapshots were excluded from peak-memory/CPU claims. The 2 CPU / 4 GiB
worker stayed running and completed all jobs. A fresh post-test idle snapshot is
recorded separately in [machine-readable evidence](CAPACITY_EVIDENCE.json).

Repeat the gate with `agent/tests/test_three_callers.py --help`, supplying three
synthetic mono 48 kHz PCM16 WAVs and the origin/access code privately. Run only
against the owner's authorized deployment; it consumes real free allowances.
Detailed logs and fixtures remain under ignored `.local/` paths.

## Free allowances and accounts

Concurrency does not multiply the monthly allowance. LiveKit Build includes
1,000 agent minutes in total: at most about 200 full five-minute calls before
other usage, shared across callers. Three active callers consume three agent
minutes per wall-clock minute. App limits remain 100 provider requests and 30,000
tokens per day; a usual spoken turn uses transcription plus response requests.

Extra Gmail addresses are not an approved quota multiplier:

| Service | Account/allowance boundary |
| --- | --- |
| Upstash | One free account per person or legal entity, regardless of email count. |
| Groq | Rate limits apply to the organization, not individual users or API keys. Its agreement prohibits use intended to avoid fees. No approved number of pooled extra accounts is documented. |
| LiveKit | A user's free projects share allowances and limits. More projects do not increase them. |
| Vercel | Hobby is personal/non-commercial; circumventing usage limits breaches fair-use rules. |

Sources checked 30 October 2026:
[Upstash terms](https://upstash.com/trust/terms),
[Upstash pricing](https://upstash.com/pricing/redis),
[Groq limits](https://console.groq.com/docs/rate-limits),
[Groq agreement](https://console.groq.com/docs/legal/services-agreement),
[LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/),
[Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines).
