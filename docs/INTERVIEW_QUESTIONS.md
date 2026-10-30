# Yuki interview questions and answer prompts

Use these as rehearsal prompts. Answer with the concrete implementation, then
state the tradeoff.

## Architecture

1. **Walk me through one voice turn.**
   Browser audio → LiveKit → Silero VAD → Groq Whisper → Groq LLM/tools →
   Kokoro ONNX → LiveKit audio → browser playback.

2. **Why WebRTC and LiveKit instead of WebSockets?**
   WebRTC provides realtime media transport, jitter handling, codec support,
   interruption-friendly audio, and room semantics. Data channels carry small
   control/transcript messages beside the media path.

3. **Where is the source of truth for settings?**
   The browser owns the current UI state; the worker validates and applies the
   runtime setting, then sends a `settings_ack` over `yuki.control.v1`.

4. **How would you scale the worker?**
   Keep workers stateless, register multiple replicas with LiveKit, keep the
   model warm per replica, and scale on active jobs/CPU. Validate with the
   multi-room concurrency gate and p50/p95 turn latency.

5. **What is the bottleneck?**
   Cold model startup and CPU Kokoro synthesis are the main local costs; STT
   and LLM network latency are provider-dependent. Prewarming and progressive
   sentence synthesis reduce perceived latency.

## Reliability and failure handling

6. **What happens when Groq returns 429?**
   The STT adapter marks the selected key rate-limited, rotates to another key,
   and retries a bounded number of times. It honors provider cooldown headers
   and shared quotas. Exhaustion produces an explicit pipeline error and ends
   the affected call; it never disguises failure as an empty successful transcript.

7. **How do interruptions work?**
   LiveKit Agents endpointing and interruption handling stop the current spoken
   response when user speech is detected; the next turn starts from fresh
   speech input.

8. **What happens if Langfuse is down?**
   The integration is fail-open. Initialization, span recording, and flushing
   are guarded; failures are logged and never awaited on the critical audio
   path.

9. **How do you test realtime behavior?**
   The LiveKit E2E test publishes synthetic 48 kHz speech, waits for actual
   transcript and audio frames, checks answer content, and validates a runtime
   settings acknowledgement. The concurrency test repeats that across rooms.

10. **How do you prevent fake metrics?**
    RTT is measured by ping/pong timestamps, turn latency starts at user speech
    end and ends when the agent enters speaking state, and benchmark UI values
    remain “not measured” until a worker-side test produces them.

## Security

11. **Which secrets reach the browser?**
    The public LiveKit WebSocket URL and a short-lived room-specific access token.
    The server signs room
    tokens; LiveKit API secrets, Groq keys, and Langfuse secret keys stay server
    side.

12. **How is token abuse limited?**
    The server generates room and participant identifiers. Admission requires
    consent, a same-origin POST, private access unless explicitly opened, and
    a ready worker. Signed owner cookies, shared Redis rate/capacity limits,
    two-minute join tokens, bounded call deadlines and provider budgets constrain abuse.

13. **What would you do before public launch?**
    Configure the existing shared controls and trusted ingress in the hosting
    accounts, confirm provider retention and billing limits, connect alerts to
    an owner, and pass physical-device and sustained-load gates in the deployment region.

## Product and engineering judgment

14. **Why include sandbox mode?**
    It makes the visualizer and microphone permissions testable without cloud
    configuration, while clearly labeling that no real agent turn is happening.

15. **Why not add a vector database?**
    The project’s knowledge base is small. Token-overlap search has zero
    infrastructure cost and low latency; embeddings become justified when the
    corpus, languages, or recall requirements grow.

16. **What failed during development?**
    Advertising native TTS streaming without implementing the required LiveKit
    stream method caused runtime errors. The fix was to use the supported
    synthesize path with sentence chunking and to keep the capability flag
    truthful.

17. **What would you improve next?**
    Add a provider abstraction for native streaming TTS,
    physical-browser E2E tests in CI, richer provider telemetry, and a real
    autoscaling policy tied to worker capacity.

18. **What did you learn?**
    In realtime systems, perceived latency, interruption behavior, observability
    correctness, and graceful degradation matter as much as raw model quality.
