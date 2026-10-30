# Yuki production readiness audit

Audit date: 11 October 2026 (India time).

**Decision: do not open this version to public traffic.** The English voice pipeline works in a real LiveKit room, but there are critical security issues, a microphone-state bug, deployment defects, broken Chinese synthesis, and failed concurrency checks. A restricted staging environment is the appropriate next milestone after fixing the critical security issues.

This is an audit of the supplied local project and its configured provider connections. It is not certification of a deployed production environment. Application source was not changed; this report and its evidence file are the audit deliverables.

## Scope and limits

Reviewed the Next.js UI, hooks, shaders, API routes, Python worker, STT/LLM/TTS adapters, key pool, local knowledge search, telemetry, tests, model downloader, Dockerfiles, Compose configuration, and deployment documentation. Ran production build and browser probes, offline tests, live provider subsystem checks, a real WebRTC conversation, and concurrency probes.

Live tests used synthetic speech. Langfuse credentials were overridden to empty values for the temporary worker. Secret values and signed tokens are excluded from this report. Local test servers and the temporary worker were stopped after the audit.

Docker Compose configuration validates, but the Docker daemon is unavailable on this machine. Container image builds, Linux runtime behavior, and actual Hugging Face/Vercel deployment health were therefore not executed. No production URL or cloud administration session was supplied. The folder has no Git metadata, so commit history, remote branch protection, and secrets in historical commits cannot be assessed.

## Verification results

| Check | Result | Meaning |
|---|---|---|
| Frontend `npm test` | 9 tests passed across 3 files | Existing component/rate-limiter tests pass; critical session/API paths are largely uncovered. |
| Frontend TypeScript and lint | Passed | No current type/lint failures. |
| Frontend `npm run build` | Passed | Main page first-load JavaScript is about 406 kB. |
| `npm ci --dry-run --ignore-scripts` | Passed | Package manifest and lockfile validate; not an actual clean install. |
| Python unit tests | 4 tests and 4 subtests passed | Limited offline routing, cleanup, knowledge, and client-selection checks. |
| Python `pip check` | Passed | Installed packages satisfy declared dependency relationships. |
| npm vulnerability scan | 14 affected dependency entries: 1 critical, 11 high, 2 moderate | Includes production Next.js vulnerabilities; entries include transitive dependency propagation. |
| Installed Python package scan | 18 advisory findings across 3 packages | `multidict`, `PyJWT`, and `urllib3`; applicability requires review, not all are proven reachable. |
| Live subsystem test | All 5 subsystems passed | Valid configured LiveKit/Groq credentials and working English TTS/STT/LLM/VAD. |
| Real LiveKit E2E | Passed | Question was transcribed; answer was “Tokyo”; voice/speed setting ACK received. Test teardown logged event-loop errors. |
| Existing 4-room gate | Failed, exit 1; reported 3/4 | Two reported passes contained only the greeting. Only one result contained the answer. |
| Stricter temporary 2-room probe | Failed, 1/2 answers | Waited for greeting transcript and required “Tokyo.” Still not a valid latency benchmark. |
| Actual multilingual TTS | 6 of 7 sample languages generated audio | Chinese failed with an unsupported phonemizer language. Audio generation does not certify pronunciation quality. |
| Headless Chromium UI | Main page rendered without page errors | Desktop and 390 px mobile view rendered; no mobile horizontal overflow. |
| Browser session failure probes | Several defects reproduced | Mute-state mismatch, connection left open after failure, and harness error-boundary fallback. |
| Docker Compose syntax | Passed | Images and runtime remain unverified. |

## Launch blockers

### 1. P0 — Known critical vulnerability in the deployed web framework

**Evidence:** `frontend/package.json:19` pins Next.js 15.2.0. The npm audit reports critical React Flight remote-code-execution exposure in the affected version range. This is an App Router application, which falls within the framework's advisory scope. Other reported advisories have feature-specific prerequisites and should not all be described as exploitable here.

**Impact:** Public exposure can compromise the web server and its LiveKit signing credentials.

**Required:** Upgrade Next.js and compatible React/framework dependencies to currently patched versions, refresh the lockfile, and rerun build, browser, and security checks. The audit currently suggests Next.js 15.5.27, but verify the supported patched target when implementing. Do not apply an automated force upgrade without reviewing the resulting changes.

Primary advisory: [Next.js CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478). Additional npm scan details are summarized in `AUDIT_EVIDENCE.json`.

### 2. P0 — Room access has no ownership boundary

**Evidence:** `frontend/src/app/api/token/route.ts:40` accepts caller-supplied room and participant names and signs join/publish/subscribe/data grants at line 88 without authenticating or authorizing that caller. Local probes obtained valid grants for both `audit-owner` and `audit-intruder` in the same chosen room. No real private room was accessed.

**Impact:** Anyone who knows a room name can request access to its audio/transcripts and controls. Choosing an existing participant identity can also disrupt that participant. Random room names are not access control.

Primary reference: [LiveKit connection/disconnection behavior](https://docs.livekit.io/intro/basics/connect/), including duplicate-identity disconnection.

**Required:** Generate rooms and identities on the server, bind them to a signed session or authenticated user, and enforce ownership on every token issuance. If shared rooms are needed, implement explicit invitations. Restrict publish sources to microphone audio for this product. Test denial of cross-session room access.

`agent/src/agent.py:255` also accepts control packets without checking the sending participant; the frontend accepts transcripts/control telemetry without checking the sender. Bind control and transcript messages to the expected participant/agent and validate their schema.

### 3. P1 — The microphone can be enabled while the UI says muted

**Evidence:** Reproduced in Chromium sandbox mode: start → mute → end → start again. The mute button still indicated muted, but the new audio track had `enabled=true`. `useVoiceSession.ts:119` creates a new track without reconciling mute state. The live connection path similarly enables the microphone unconditionally at line 318 while retaining the previous React mute flag.

**Impact:** The UI can misrepresent whether microphone audio is being captured/published. A failed mute operation can also leave the optimistic UI state wrong because it updates before the SDK operation succeeds.

**Required:** Derive the mute indicator from the actual track/publication state, or atomically apply and confirm the intended mute state on every new session/device change. Define whether mute persists between calls. Verify both sandbox and real calls, including rejected mute operations and device switching.

### 4. P1 — The documented frontend container cannot build as written

**Evidence:** `frontend/Dockerfile:31` contains `COPY --from=builder /app/public ./public 2>/dev/null || true`. Docker COPY does not execute shell redirection or shell operators; those tokens become path arguments. The frontend also has no `public/` directory to copy.

**Impact:** The documented Compose/standalone container path is broken even though the local Next.js build passes. This finding is from source inspection; no Docker image build was possible.

**Required:** Correct the COPY instruction and handle the absent public directory deliberately. Add `.dockerignore` files: the current frontend build context includes `.env.local`, local dependencies, and old build output. Inject deployment secrets at runtime and verify a clean container build/start.

### 5. P1 — Hugging Face deployment packaging is incomplete

**Evidence:** `deploy/huggingface/Dockerfile:12` copies local model binaries, but `.gitignore` excludes those binaries. There is no root Space Dockerfile or Space README metadata in the supplied tree, and the worker listens on 8081 while Spaces default to port 7860. The instructions do not provide a complete deployable Space bundle.

**Impact:** Copying/pushing this source alone is insufficient for the recommended deployment. Missing assets or the wrong exposed application port can prevent startup/readiness.

**Required:** Produce a Space-specific bundle with the correct root Dockerfile, `sdk: docker` metadata, matching `app_port`, model provisioning, and runtime secrets. Verify it from a clean checkout. For continuous public service, resolve free-hardware sleep behavior and cold starts; no availability mechanism is implemented here.

Primary references: [Docker Spaces configuration](https://huggingface.co/docs/hub/spaces-sdks-docker) and [hardware sleep behavior](https://huggingface.co/docs/hub/spaces-gpus). The latter documents inactivity sleep for default CPU hardware.

### 6. P1 — Chinese voice output is broken, and language routing is unreliable

**Evidence:** Actual synthesis of a Chinese sample through the configured language/voice selection failed: `language "zh" is not supported by the espeak backend`. The adapter returns `zh` at `kokoro_engine.py:152`. Routing probes also classified English “Come here.” as Italian and Portuguese “Bom dia, obrigado.” as English. The seven-case routing test passes because it tests labels for selected examples, not actual speech synthesis.

**Impact:** A prominently offered Chinese voice can yield silence/error. Some English sentences use the wrong phonemizer/voice. Portuguese and German claims in the prompt exceed the implemented automatic routing.

**Required:** Use language codes supported by the installed phonemizer, verify every advertised language through the full synthesis adapter, and use explicit session language or reliable detection rather than isolated word matches. Narrow advertised support until verified. Have native speakers assess pronunciation; generated audio alone is insufficient.

### 7. P1 — Concurrency and latency are not ready for a launch claim

**Evidence:** The 4-room run failed and returned one real answer, two greetings counted as answers, and one empty transcript. A stricter two-room probe returned one answer. Worker logs reported full CPU capacity and missing warmed processes. The first English subsystem TTS call took 4,652.8 ms for 3.20 seconds of audio (RTF about 1.45). A later short English sample took 1,128 ms for 1.28 seconds of audio, showing material warm/load sensitivity.

**Impact:** Public users can join and receive no response or long startup delays. These local measurements do not establish capacity on the intended production hardware. The README's sub-second claim is not demonstrated.

**Required:** Prewarm the TTS model as well as VAD; currently `agent.py:163` only prewarms VAD and builds Kokoro after room assignment at line 221. Measure startup and steady-state turns separately. Set admission limits appropriate to CPU/RAM and provider quotas, return a clear busy state, and run corrected load/soak tests on the chosen deployment hardware before selecting replica counts.

### 8. P1 — Groq failover and capacity assumptions are incorrect

**Evidence:** `agent.py:206` constructs the LLM with one initial key for the entire room. It does not rotate that key or mark its failures through the pool. STT does select keys per request, but `key_pool.py:69` immediately returns a cooling key when all keys are cooling. Each worker job has a separate process-local pool, so room processes do not share cooldown/admission state and initially select the same position in the key list. STT swallows exhausted errors into empty transcription and creates clients without explicit close calls.

**Impact:** Rate limiting can stall conversations despite the advertised multi-key LLM failover. Multiple keys from one organization do not create independent Groq capacity.

**Required:** Implement bounded, observable retries/failover for both LLM and STT, honor provider retry headers, reuse/close HTTP clients, and give users an actionable failure state. Coordinate quota/admission at the scope where it is actually enforced. Set a total turn deadline; per-request timeouts plus SDK retries are not a total deadline.

Primary reference: [Groq rate limits](https://console.groq.com/docs/rate-limits), which documents organization-level quotas.

### 9. P1 — Public usage has no reliable cost/admission controls

**Evidence:** `frontend/src/lib/rateLimit.ts:10` uses a process-local Map. It cannot enforce a global limit across serverless instances or restarts. The token endpoint trusts forwarded headers directly. On the local server, 31 requests under one header yielded 30 successes and one 429; changing that header yielded another success. Whether production forwarding headers are sanitized depends on the ingress configuration, which was not available.

**Impact:** Anonymous traffic can create many rooms and consume worker/provider resources. Token TTL limits joining validity, while this code has no explicit application session-duration or account usage policy.

Primary reference: [LiveKit token lifecycle](https://docs.livekit.io/frontends/reference/tokens-grants/), which documents that token expiration affects initial connection rather than limiting an established session.

**Required:** Shared rate/admission limits, trusted ingress IP extraction, anonymous session identity or access gating, concurrent-session caps, maximum call duration, provider spend limits, and a kill switch. Anonymous use can remain a product choice if these controls exist.

### 10. P1 — Health checks do not establish voice readiness

**Evidence:** `/api/health` reports HTTP 200 and `status=ok` based on environment strings at `route.ts:4`; it does not probe providers or an accepting worker. During worker drain and after worker shutdown it still reported configured/healthy. `/api/harness` reads frontend environment variables, not worker status, so the documented secret separation makes its Groq/Langfuse status inaccurate. `useVoiceSession.ts:326` sends initial settings once before confirming the worker is ready and never processes a settings ACK.

**Impact:** Infrastructure and UI can appear ready when no functional agent is available; initial preferences can race a cold worker.

**Required:** Separate liveness from application readiness. Track worker registration/model readiness and verify the voice path with synthetic monitoring. Add an agent-ready handshake, settings ACK/retry, and a user-visible timeout/recovery path when no agent joins.

### 11. P1 — Missing models and synthesis failures masquerade as audio success

**Evidence:** `kokoro_engine.py:320` emits a 440 Hz tone when no model is loaded; synthesis exceptions at line 356 are converted to silence. A missing-model probe emitted nonzero audio frames with `modelLoaded=false`. `agent/Dockerfile:26` suppresses model-download failure while claiming a startup deferral that the startup command never implements. `download_models.sh:16` lacks HTTP failure handling, atomic download, and checksum validation; an error response or partial file can be retained as an existing model.

**Impact:** A worker can accept calls and appear to generate audio while it cannot speak. Audio-frame-count tests can falsely pass.

**Required:** Fail startup/readiness on unavailable/corrupt critical assets, verify downloads, and surface synthesis failures as explicit session errors. Keep demonstration tones confined to an explicit demo mode. Never release on audio-frame count alone.

### 12. P1 — Transcript privacy and secret isolation need a deliberate launch policy

**Evidence:** `agent.py:135` and line 338 log complete transcripts; `telemetry.py:66` sends text as both observation input and output to Langfuse. The UI contains no processing/retention disclosure. `layout.tsx:19` describes “on-device intelligence,” while speech/text are processed by Groq and TTS runs on the server. Both Compose services inherit the entire root `.env`; the frontend server therefore receives worker-only Groq/Langfuse credentials. The actual frontend local environment also contains Langfuse keys.

**Impact:** Users can misunderstand where speech/transcripts go, and logs/traces retain unnecessary sensitive content. Excess secrets enlarge the consequence of a frontend compromise.

**Required:** Explain processing before starting a real call; define transcript logging, redaction, retention, access, and deletion/opt-out behavior. Disable raw transcript logging by default where it is not needed. Pass each service only its required credentials. No configured secrets were found in the built browser static bundle, and historical leakage could not be assessed.

## Reliability, release, and product gaps

### 13. P1 — Browser failures leave a connection running

**Evidence:** A Chromium live-connection probe displayed `Connection error: Not supported` while its instrumented RTCPeerConnection still had `connectionState=connected`. The catch block at `useVoiceSession.ts:332` shows a notice without disconnecting or clearing the partially initialized room. A retry can replace the reference and orphan the previous connection.

**Required:** One idempotent cleanup path for failure, disconnect, retry, and unmount. Detach audio elements, stop owned tracks, remove listeners, clear references, and reconcile session/mute state. Add connection cancellation and bounded token/agent-ready waits. Also expose an audio-unlock recovery button: failed autoplay is currently only logged, and creating a separate AudioContext does not prove the remote element is playable on Safari.

### 14. P1 — The release gates can pass a broken service

**Evidence:** The concurrency test accepts any agent transcript, including its greeting (`test_concurrency.py:112`), starts its latency clock before joining (`:75`), and miscomputes small-sample p95 (`:132`). An injected LLM outage and missing-model result still made `eval_harness.main()` return 0 (`eval_harness.py:201`). The E2E test accepts “japan” as an answer and counts frames without asserting meaningful speech energy. Its exit also logged event-loop errors.

**Required:** Assert correct user transcription and answer semantics, actual non-silent audio, greeting completion, settings application, and clean teardown. Measure user end-of-speech to first audible response separately from session startup. Required provider/model failures must exit nonzero. Add automated coverage for ownership denial, retry/cancellation, mute/device state, barge-in, reconnect, and provider failures.

No CI workflow is present in this supplied folder. Add a protected release pipeline using a reproducible clean installation, tests, security checks, container smoke tests, staging E2E, and a documented rollback. Existing local green checks alone must not authorize deployment.

### 15. P2 — Turn telemetry uses obsolete events and cannot support alerts

**Evidence:** `agent.py:370` and line 374 subscribe to `user_started_speaking` / `user_stopped_speaking`. Those names are absent from installed LiveKit Agents 1.7.0's session event types. Actual logs showed `user_state_changed` transitions; no turn-latency publication was produced in the observed E2E turn. The code never passes latency to `telemetry.record_turn` or handles `metrics_collected`/session errors. Langfuse spans are immediate transcript spans, not STT/LLM/TTS timing spans.

**Required:** Use current state/metrics events, associate metrics with sessions/turns, and collect first-audio latency, interruption delay, queue/startup time, provider errors, active jobs, CPU/RAM, and cost. Configure actionable alerts and a synthetic conversation check. Dashboard environment presence must not be labeled proof of telemetry health.

### 16. P2 — Dependency/runtime installations are not reproducible

**Evidence:** All Python dependencies use open-ended `>=` constraints, starting at SDK versions older than the APIs used. The tested environment has LiveKit Agents 1.7.0, Kokoro 0.6.1, and Langfuse 4.15.1. There is no Python lock/constraints file. The frontend Dockerfile uses Node 20, but installed Vitest 5 and jsdom 30 require newer Node releases for tests; the successful local checks used Node 26.

**Required:** Lock compatible Python dependencies and define/test one supported Node/Python runtime across local, CI, and containers. Resolve the Python scan findings with dependency updates or documented applicability/mitigation. Re-scan the actual Linux images; installed macOS package findings are not a container scan.

### 17. P2 — The diagnostics dashboard crashes on its own rate limit

**Evidence:** A browser probe substituted the documented 429 response for the benchmark endpoint. Clicking “Show test commands” replaced the page with the application error boundary. `HarnessDashboard.tsx:128` stores every JSON response as benchmark data, then dereferences `benchData.subsystems.language_routing` at line 348.

**Required:** Check HTTP status, validate response shapes, and render a local retry/error state. Scope operational diagnostics appropriately. The endpoint currently returns test commands rather than executing real benchmarks; that behavior is correctly disclosed in its response but several dashboard descriptions overstate integration.

### 18. P2 — Audio/UI lifecycle and accessibility need verification

**Evidence:** `VoiceVisualizer.tsx:214` chooses the analyser using `state` captured by the mount-only effect at line 286, so later speaking state does not change the captured analyser choice. Its audio-source effects do not disconnect their nodes, and its AudioContext is not closed on unmount. `useVoiceSession.ts:64` creates another AudioContext on each start without closing it. Preferences did not close on Escape in a browser probe; modal focus trapping/restoration is absent from the reviewed implementations. Voice previews use browser speech synthesis, not the selected Kokoro voice.

**Required:** Correct the captured-state bug; dispose audio resources and bound transcript history for long sessions. Verify WebGL fallback/context loss, reduced-motion behavior, touch, keyboard/screen-reader navigation, modal focus, and real Safari/iOS/Android audio. Label browser previews accurately or provide real Kokoro samples. The mobile layout rendered successfully at 390 px; this is not a device compatibility certification.

## Recommended completion order

1. Patch critical dependencies, close arbitrary-room issuance, and correct mute-state behavior before exposing staging beyond the team.
2. Establish reproducible builds and a complete deployment bundle; fix model readiness/downloads and Chinese synthesis.
3. Implement connection/agent readiness, cleanup, provider-failure feedback, and shared usage/admission controls.
4. Repair the release gates, prewarm TTS, and measure actual deployment capacity; then choose hosting/replicas based on evidence.
5. Add accurate monitoring, privacy disclosure/retention, scoped secrets, a CI release gate, and rollback instructions.
6. Finish browser/device/accessibility checks and narrow product claims to verified behavior.

## Acceptance criteria before public launch

- No unresolved reachable critical security vulnerabilities; high-severity findings patched or explicitly assessed.
- A second session cannot obtain a token for another session's room or impersonate its participant.
- UI mute indication always agrees with actual microphone capture/publication across reconnect, failure, and device changes.
- Clean Linux frontend/worker builds succeed and boot with validated assets and scoped secrets.
- Every advertised language produces verified intelligible speech; unsupported languages fail clearly.
- Corrected E2E and load gates pass on intended hardware at a declared concurrency limit, with startup/turn latency and timeout/error budgets agreed in advance.
- Provider outage, quota exhaustion, absent worker, invalid settings, and model corruption produce clear bounded recovery behavior.
- Liveness/readiness and alerts detect a stopped or nonfunctional voice worker.
- Users understand remote speech processing and transcript handling; retention/access controls are configured.
- Release procedure, staging smoke check, rollback, operational owner, and real browser/device results are recorded.

No database, vector store, Kubernetes cluster, or new agent framework is necessary to solve these launch blockers. The current architecture can be retained while fixing its security boundaries, lifecycle handling, deployment packaging, and evidence quality.
