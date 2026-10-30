# Deployed demo verification

Follow-up fixes and longer conversation/preview evidence are recorded in
[recovery verification](RECOVERY_VERIFICATION.md). The original launch evidence
below predates those fixes.

The later [three-user capacity verification](CAPACITY_VERIFICATION.md) supersedes
the original one-call admission limit reported below.

Verified 30 October 2026, India time, against
[yuki-voice-agent.vercel.app](https://yuki-voice-agent.vercel.app).
The frontend is on the owner's Vercel Hobby account. The Python worker is deployed
to LiveKit Build in Mumbai, with Upstash Free shared controls and Groq Free inference.
The owner confirmed the free provider plans, claimed Redis, and accepted automatic
worker startup to keep this personal demo at ₹0 within the included quotas.

| Check | Result |
| --- | --- |
| Frontend type checking and lint | Passed |
| Frontend tests | 25 passed |
| Next.js production build | Passed locally and deployed successfully on Vercel, Node 24 |
| Frontend advisory scan | No known vulnerabilities |
| Python compatibility and compilation | Passed |
| Python regressions | 18 tests and 4 subtests passed |
| Python advisory scan | 121 installed packages checked; no known vulnerabilities |
| Linux worker Docker build and startup | Passed on LiveKit Cloud; non-root worker and verified model assets |
| Seven-language local synthesis | All seven produced non-silent 24 kHz speech |
| Browser consent, preferences focus/Escape, diagnostic failure, sandbox mute/cleanup | Passed in headless Chromium |
| Deployed browser connect, mute, disconnect, reconnect and resource cleanup | Passed |
| Mobile width and reduced motion | Passed at 390 × 844 and with reduced motion enabled |
| Deployed admission boundaries | Missing consent 400; wrong access code 403; foreign origin 403; second caller at capacity 429; cross-owner cleanup 403; owner cleanup 200 |
| Production diagnostics | `/api/harness` returns 404; token GET returns 405 |
| Real deployed voice and settings | Recognized the synthetic Japan-capital question, acknowledged voice/speed/style changes, and returned a non-silent spoken Tokyo answer |
| Final voice timing | 8,229 ms startup including greeting; 2,332 ms from end of question to first answer audio; passed the existing 5,000 ms gate |
| Real interruption | Playback stopped in 109 ms; recognized the interruption and spoke the Tokyo follow-up answer |
| Secret checks | No configured secret values found in tracked source or public JavaScript bundles; standalone output contains no dotenv files |

The worker release uses LiveKit Agents/plugins 1.8.10. Updating the old SDK was
necessary to use patched OpenTelemetry dependencies. Other patched dependencies
include aiohttp, certifi, Pillow and the development-only filelock dependency.
Next.js was patched to 16.4.3 and vulnerable frontend transitive dependencies were
updated. All resolved Python dependencies remain pinned in the runtime/development
constraint files.

Cloud readiness starts on the server startup event rather than a custom load
callback, which Cloud overrides. Explicit named dispatch supports automatic startup
without a stale heartbeat. Consent, the private access code and an atomic shared
lease are enforced before dispatch. Microphone capture waits for worker readiness
and settings acknowledgements. Failed dispatch cleanup and delayed handshakes have
dedicated regression tests.

## Scope and evidence

The live tests use synthetic speech. Browser checks use simulated microphone
devices; physical Safari, iOS and Android microphones, native pronunciation review,
long-running load and long-idle sleep/resume behavior were not certified. The timing
above is a smoke-test sample, not a p95 estimate or latency guarantee. The global
admission limit remains one call. The native WebRTC SDK can emit data-channel-close
messages during room teardown; the checked browser connections/tracks closed and
the worker returned to readiness.

Machine-readable evidence is in `docs/DEPLOYMENT_EVIDENCE.json`. Detailed logs,
synthetic audio and screenshots remain under ignored `.local/` paths, including:

- `voice-final.json`, `interruption-final.json` and `production-admission-current.json`;
- `browser-regression-current/results.json` and `browser-live-final/results.json`;
- `languages-current.json` and `python-audit-patched.json`;
- `livekit-final-status.json` and the worker build/runtime logs.

Repeat browser checks with `scripts/check-browser.py`. Repeat real speech and
interruption checks with `agent/tests/test_livekit_e2e.py` and
`agent/tests/test_barge_in.py`, supplying the origin and access code privately.

Source is published at [Rafi-SBM/koe-Yuki](https://github.com/Rafi-SBM/koe-Yuki)
with four-word commit subjects. The evidence above records the original deployment
before publication; its original source hashes are mapped in the
[repository history guide](REPOSITORY_HISTORY.md). Releases use the documented
Vercel and LiveKit CLI deployment commands. See [hosting limits](HOSTING.md) and
[deployment instructions](../deploy/README.md).
