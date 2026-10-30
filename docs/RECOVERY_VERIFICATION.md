# Conversation recovery and real voice previews

Deployed and verified on 30 October 2026 at
[yuki-voice-agent.vercel.app](https://yuki-voice-agent.vercel.app).
Free plans, admission controls, provider budgets and the five-minute call deadline
remain in effect. No paid service or dependency was added.

## Conversation stopping

The reported call's worker logs show a language-provider `APIError` immediately
followed by the SDK closing the session. The old wrapper discarded the specific
reason. Application budget checks raised that same error type, and requests sent
the entire growing conversation under a conservative UTF-8 token reservation.
Both oversized requests and a temporary quota pause could therefore end a call.

Requests now preserve system/developer instructions and complete recent user turns
within a bounded reservation, including paired tool calls/results. They retain
the current question without silently shortening it. An oversized single question
gets a request to shorten it. The browser transcript is unaffected by this model
context window.

Expected budget, provider and recognition failures now publish a pause notice
without tearing down the room. An LLM failure before any output also produces an
honest spoken explanation. Partial output is never replayed; an interrupted turn
can be retried. A subsequent successful response clears the provider notice without
clearing unrelated audio warnings. Minute and daily caps still apply, and failed
or uncertain requests retain conservative accounting. Explicitly rejected requests
refund only unused tokens, never the request count. Unexpected implementation and
speech-synthesis faults still fail visibly rather than claiming success.

## Voice previews

The old preview selected the first browser voice matching a language, regardless
of the chosen Kokoro voice ID. Every voice within a language could therefore sound
identical. Previews now play locally generated samples made through the same Kokoro
adapter and voice IDs as live speech: 17 named voices plus an English Auto example.
All 18 samples have distinct PCM hashes. Switching previews or closing the modal
stops the previous audio. Preview playback does not start a worker or call Groq.

## Verification

| Check | Result |
| --- | --- |
| Frontend type checking, lint, production build | Passed; Vercel production deployment ready |
| Frontend tests | 29 passed |
| Python regressions and compilation | 22 tests and 4 subtests passed |
| Long deployed conversation | 10 recognized questions with spoken Tokyo answers in the same admitted room, over 163 seconds |
| Quota recovery during that conversation | Two pauses recovered without reconnecting; waits of 57 and 36 seconds |
| Real browser pause/recovery | Visible pause notice while End Call stayed available; a new spoken question received a Tokyo answer after reset; same peer connections; notice cleared |
| Browser teardown | All owned microphone tracks and peer connections closed; no page errors |
| Production preview playback | All 18 sample URLs, decoded PCM hashes and actual playing audio sources matched the manifest |
| Preview lifecycle | Previous audio stopped on switching; modal close stopped playback; no page errors |

The recovery gates temporarily **add** a minute reservation while owning the sole
admitted test call, then wait for the next natural window. They do not delete
counters, refund uncertain provider usage, raise limits or bypass admission. The
long conversation also encountered a second natural quota pause and recovered.

These are synthetic-speech and headless Chromium checks, not physical-device,
pronunciation, sustained-load or uptime certification. Temporary free-quota pauses
and the five-minute call deadline are intentional limits of the ₹0 demo.

Machine-readable results are in `RECOVERY_EVIDENCE.json`. Detailed logs, the browser
recovery script, screenshots and synthetic question audio remain under ignored
`.local/` paths. Repeat the long-call gate with
`agent/tests/test_conversation_recovery.py`; repeat preview checks with
`scripts/check-voice-previews.py`. Regenerate samples locally with
`scripts/generate-voice-previews.py` after changing voice assets or sample phrases.
