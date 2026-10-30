# Yuki — interview talk track

## 30-second version

Yuki is a real-time, multilingual voice agent. The browser captures microphone
audio and sends it over LiveKit WebRTC. Silero VAD detects speech boundaries,
Groq Whisper transcribes the turn, Groq runs the conversational model, and a
local Kokoro ONNX worker synthesizes the response back into the room. The UI
also exposes live voice controls, a 3D audio-reactive visualizer, transcripts,
diagnostics, and optional Langfuse observability.

## Two-minute version

I built Yuki to solve the latency and reliability problems that appear when a
voice demo becomes a real system. The browser is responsible for interaction,
device selection, playback, visual feedback, and a small versioned control
protocol. LiveKit handles realtime media instead of sending audio through a
traditional request/response API. The Python worker keeps the local Kokoro
model warm, uses Silero for endpointing and interruption, and uses a Groq key
pool with cooldown handling for STT resilience.

Voice and response-style settings are sent over a reliable LiveKit data channel
without reconnecting. The agent validates them before applying them. TTS is
progressive at sentence boundaries because the Kokoro ONNX API returns a
waveform per synthesis call; this starts playback earlier while keeping the
implementation honest about not being token-level streaming.

The system also has a dependency-free Markdown knowledge base with function
tools for local retrieval and current time. Langfuse is optional and fail-open:
turn observations are queued asynchronously, and tracing errors cannot break
the audio path. The frontend has a sandbox mode so the visual experience can be
tested without cloud credentials, while the real WebRTC gate verifies VAD,
STT, LLM, TTS, transcript delivery, and runtime voice control together.

## Architecture decisions worth discussing

- LiveKit WebRTC was chosen for low-latency bidirectional audio and room-based
  fan-out.
- Kokoro runs on the worker to avoid an external per-character TTS API.
  Worker compute still costs money; LiveKit and Groq process audio/text externally.
- Groq is used for fast hosted STT/LLM inference; STT retries across keys after
  rate limits and transient errors.
- The browser never receives LiveKit signing secrets or Groq/Langfuse secrets.
- Settings use a versioned data-channel protocol so the session stays alive.
- The app uses sentence chunks for progressive Kokoro playback rather than
  claiming native token streaming.
- Metrics shown as live are measured from the room or worker. Offline benchmark
  numbers are not presented as live dashboard facts.

## Honest limitations

- The current concurrency gate is an integration/load check, not a full
  production traffic model. Capacity must still be measured at the target host.
- Browser voice previews use the browser speech engine; the call itself uses
  the selected Kokoro voice on the worker.
- Local retrieval is token-overlap Markdown search, deliberately lightweight;
  it is not a semantic embedding/vector database.
- Internal Prometheus metrics include reported provider tokens and subsystem
  durations. Optional Langfuse receives character counts and durations; text spans
  are filtered. Actual billed cost still needs provider-account reconciliation.

## Strong closing sentence

The most important engineering lesson was to make the realtime path small and
failure-tolerant, then keep diagnostics and experimentation around it without
letting observability, UI controls, or benchmark tooling become dependencies of
the audio path.
