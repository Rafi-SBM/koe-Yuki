import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceSession } from "../useVoiceSession";
const mocks = vi.hoisted(() => ({ rooms: [] as object[], failMic: false, acknowledge: true }));
vi.mock("livekit-client", () => {
  const events = { TrackSubscribed: "track", TrackUnsubscribed: "untrack", LocalTrackPublished: "local", ActiveSpeakersChanged: "speakers", ConnectionQualityChanged: "quality", DataReceived: "data", ParticipantDisconnected: "left", ConnectionStateChanged: "state" };
  class MockRoom {
    state = "connected"; remoteParticipants = new Map(); handlers = new Map();
    microphone = { stop: vi.fn(), mediaStreamTrack: { enabled: true } };
    localParticipant = { audioTrackPublications: new Map([["mic", { track: this.microphone }]]),
      getTrackPublication: () => ({ track: this.microphone }),
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => { if (mocks.failMic) throw new Error("Not supported"); this.microphone.mediaStreamTrack.enabled = enabled; }),
      publishData: vi.fn(async (payload: Uint8Array) => { const packet = JSON.parse(new TextDecoder().decode(payload)); if (mocks.acknowledge && ["hello", "settings"].includes(packet.type)) this.handlers.get("data")?.(new TextEncoder().encode(JSON.stringify({ protocol: "yuki.control.v1", type: packet.type === "hello" ? "ready" : "settings_ack", id: packet.id })), { kind: 4 }, undefined, "yuki.control"); }) };
    constructor() { mocks.rooms.push(this); }
    on(event: string, handler: unknown) { this.handlers.set(event, handler); return this; }
    connect = vi.fn().mockResolvedValue(undefined); disconnect = vi.fn().mockResolvedValue(undefined); startAudio = vi.fn().mockResolvedValue(undefined); switchActiveDevice = vi.fn().mockResolvedValue(undefined);
  }
  return { Room: MockRoom, RoomEvent: events, Track: { Source: { Microphone: "microphone" }, Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 }, ConnectionState: { Connected: "connected", Disconnected: "disconnected" }, ConnectionQuality: { Excellent: "excellent", Good: "good", Poor: "poor", Lost: "lost", Unknown: "unknown" } };
});
function stream() { const track = { enabled: true, stop: vi.fn() }; return { track, getTracks: () => [track], getAudioTracks: () => [track] }; }
beforeEach(() => {
  mocks.rooms.length = 0; mocks.failMic = false; mocks.acknowledge = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isConfigured: true, token: "test", serverUrl: "wss://test", lease: "lease", deadline: Date.now() + 300000 }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("microphone lifecycle", () => {
  it("keeps reply queue notices when an independent speech notice clears", async () => {
    const { result, unmount } = renderHook(useVoiceSession);
    await act(() => result.current.connect());
    const room = mocks.rooms[0] as { handlers: Map<string, (...args: unknown[]) => void> };
    const notice = (source: string, message: string | null) => room.handlers.get("data")!(new TextEncoder().encode(JSON.stringify({ protocol: "yuki.control.v1", type: "notice", source, message })), { kind: 4 }, undefined, "yuki.control");
    act(() => { notice("response", "Preparing your reply."); notice("speech", "Preparing speech."); notice("speech", null); });
    expect(result.current.configNotice).toBe("Preparing your reply.");
    act(() => notice("response", null));
    expect(result.current.configNotice).toBeNull();
    expect(result.current.isConnected).toBe(true);
    unmount();
  });
  it("shows a free-limit pause without disconnecting and clears it after recovery", async () => {
    const { result, unmount } = renderHook(useVoiceSession);
    await act(() => result.current.connect());
    const room = mocks.rooms[0] as { handlers: Map<string, (...args: unknown[]) => void>; disconnect: ReturnType<typeof vi.fn>; microphone: { stop: ReturnType<typeof vi.fn> } };
    const notice = (message: string | null) => room.handlers.get("data")!(new TextEncoder().encode(JSON.stringify({ protocol: "yuki.control.v1", type: "notice", message })), { kind: 4 }, undefined, "yuki.control");
    act(() => notice("The free service needs a short pause. Please try again in 12 seconds."));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.configNotice).toContain("12 seconds");
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(room.microphone.stop).not.toHaveBeenCalled();
    act(() => notice(null));
    expect(result.current.configNotice).toBeNull();
    expect(result.current.isConnected).toBe(true);
    unmount();
  });
  it("waits through a cloud cold start without capturing audio before the worker handshake", async () => {
    vi.useFakeTimers(); mocks.acknowledge = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isConfigured: true, token: "test", serverUrl: "wss://test", lease: "lease", deadline: Date.now() + 300000, startupTimeoutMs: 90000 }) }));
    const { result, unmount } = renderHook(() => useVoiceSession());
    let connecting: Promise<void>;
    await act(async () => { connecting = result.current.connect(); await vi.advanceTimersByTimeAsync(21000); });
    const room = mocks.rooms[0] as { localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn> } };
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.configNotice).toContain("Starting Yuki");
    mocks.acknowledge = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); await connecting; });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.configNotice).toBeNull();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, { deviceId: undefined });
    unmount();
  });
  it("keeps the sandbox microphone muted across stop, restart and device changes", async () => {
    const first = stream(), second = stream(), third = stream();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third) } });
    const { result, unmount } = renderHook(useVoiceSession);
    await act(() => result.current.startSandbox()); await act(() => result.current.toggleMic());
    expect(first.track.enabled).toBe(false);
    act(() => result.current.disconnect()); expect(first.track.stop).toHaveBeenCalled();
    await act(() => result.current.startSandbox()); expect(result.current.isMicMuted).toBe(true); expect(second.track.enabled).toBe(false);
    await act(() => result.current.switchActiveDevice("other")); expect(second.track.stop).toHaveBeenCalled(); expect(third.track.enabled).toBe(false);
    unmount(); expect(third.track.stop).toHaveBeenCalled();
  });
  it("cleans up a room when microphone publication fails", async () => {
    mocks.failMic = true;
    const { result } = renderHook(useVoiceSession);
    await act(() => result.current.connect());
    const room = mocks.rooms[0] as { disconnect: ReturnType<typeof vi.fn>; microphone: { stop: ReturnType<typeof vi.fn> } };
    expect(room.disconnect).toHaveBeenCalled(); expect(room.microphone.stop).toHaveBeenCalled(); expect(result.current.isConnected).toBe(false);
    expect(result.current.configNotice).toContain("Not supported");
  });
  it("applies retained mute state before reporting a live connection and waits for settings ACK", async () => {
    const { result, unmount } = renderHook(useVoiceSession);
    await act(() => result.current.toggleMic()); await act(() => result.current.connect());
    const room = mocks.rooms[0] as { localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn>; publishData: ReturnType<typeof vi.fn> } };
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false, expect.any(Object));
    expect(room.localParticipant.publishData.mock.calls.length).toBe(2); expect(result.current.isConnected).toBe(true);
    mocks.failMic = true; await act(() => result.current.toggleMic()); expect(result.current.isMicMuted).toBe(true);
    unmount();
  });
  it("stops a microphone obtained after a cancelled sandbox start", async () => {
    let complete!: (value: unknown) => void;
    const audio = stream();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => new Promise(resolve => { complete = resolve; }) } });
    const { result } = renderHook(useVoiceSession);
    let connecting!: Promise<void>;
    act(() => { connecting = result.current.startSandbox(); }); act(() => result.current.disconnect());
    await act(async () => { complete(audio); await connecting; });
    expect(audio.track.stop).toHaveBeenCalled(); expect(result.current.isConnected).toBe(false);
    await waitFor(() => expect(result.current.isConnecting).toBe(false));
  });
});
