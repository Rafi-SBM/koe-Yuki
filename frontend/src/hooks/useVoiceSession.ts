"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Room, RoomEvent, Track, ConnectionState, ConnectionQuality, ParticipantKind } from "livekit-client";
import type { VisualizerState } from "@/components/VoiceVisualizer";
import type { ChatMessage } from "@/components/TranscriptDrawer";
export type QualityState = "EXCELLENT" | "GOOD" | "POOR" | "LOST" | "UNKNOWN";
const encode = (data: object) => new TextEncoder().encode(JSON.stringify({ protocol: "yuki.control.v1", ...data }));
export function useVoiceSession() {
  const [isConnected, setIsConnected] = useState(false), [isConnecting, setIsConnecting] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [isSandboxMode, setIsSandboxMode] = useState(false), [visualizerState, setVisualizerState] = useState<VisualizerState>("IDLE");
  const [isMicMuted, setIsMicMuted] = useState(false), [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]), [configNotice, setConfigNotice] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null), [turnLatencyMs, setTurnLatencyMs] = useState<number | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<QualityState>("UNKNOWN");
  const [localMicTrack, setLocalMicTrack] = useState<MediaStreamTrack | null>(null), [remoteAgentTrack, setRemoteAgentTrack] = useState<MediaStreamTrack | null>(null);
  const roomRef = useRef<Room | null>(null), sandboxStreamRef = useRef<MediaStream | null>(null);
  const micMuted = useRef(false), speakerMuted = useRef(false), generation = useRef(0), busy = useRef(false), lease = useRef<string | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (error: Error) => void }>());
  const addTranscriptMessage = useCallback((sender: "user" | "agent", text: string) => {
    setMessages(previous => [...previous.slice(-499), { id: crypto.randomUUID(), sender, text: text.slice(0, 12000), timestamp: new Date().toLocaleTimeString() }]);
  }, []);
  const release = useCallback(() => {
    const ticket = lease.current; lease.current = null;
    if (ticket) void fetch("/api/session/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lease: ticket }), keepalive: true }).catch(() => {});
  }, []);
  const cleanup = useCallback(() => {
    generation.current++;
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = null;
    if (deadlineTimer.current) clearTimeout(deadlineTimer.current);
    deadlineTimer.current = null;
    for (const waiter of pending.current.values()) waiter.reject(new Error("Call ended"));
    pending.current.clear();
    sandboxStreamRef.current?.getTracks().forEach(track => track.stop()); sandboxStreamRef.current = null;
    const room = roomRef.current; roomRef.current = null;
    if (room) {
      room.remoteParticipants.forEach(participant => participant.audioTrackPublications.forEach(publication => publication.track?.detach().forEach(element => element.remove())));
      room.localParticipant.audioTrackPublications.forEach(publication => publication.track?.stop());
      void room.disconnect(true).catch(() => {});
    }
    release();
  }, [release]);
  const disconnect = useCallback(() => {
    cleanup(); busy.current = false;
    setProviderNotice(null);
    setAudioBlocked(false); setIsConnected(false); setIsConnecting(false); setIsSandboxMode(false); setVisualizerState("IDLE");
    setLocalMicTrack(null); setRemoteAgentTrack(null); setConnectionQuality("UNKNOWN"); setPingMs(null); setTurnLatencyMs(null);
  }, [cleanup]);
  const requestControl = useCallback(async (room: Room, type: string, data: object = {}, timeoutMs = 20000) => {
    if (pending.current.size >= 10) throw new Error("Too many pending controls");
    const id = crypto.randomUUID();
    const acknowledgement = new Promise<void>((resolve, reject) => { pending.current.set(id, { resolve, reject }); });
    const timer = setTimeout(() => pending.current.get(id)?.reject(new Error("The voice worker did not acknowledge the request.")), timeoutMs);
    const send = () => room.localParticipant.publishData(encode({ type, id, ...data }), { reliable: true, topic: "yuki.control" });
    const retry = setInterval(() => { void send().catch(() => {}); }, 1500);
    try { await send(); await acknowledgement; } finally { clearTimeout(timer); clearInterval(retry); pending.current.delete(id); }
  }, []);
  const sendSettings = useCallback((voice: string, speed: number, responseStyle: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      if (roomRef.current === room) void requestControl(room, "settings", { voice, speed, responseStyle }).catch(() => { if (roomRef.current === room) setConfigNotice("Voice settings were not confirmed. Please retry."); });
    }, 200);
  }, [requestControl]);
  const extractLocalMicTrack = useCallback((room: Room) => {
    setLocalMicTrack(micMuted.current ? null : room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack || null);
  }, []);
  const startSandbox = useCallback(async () => {
    if (busy.current || roomRef.current || sandboxStreamRef.current) return;
    busy.current = true; const attempt = ++generation.current; setIsConnecting(true); setConfigNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (generation.current !== attempt) { stream.getTracks().forEach(track => track.stop()); return; }
      stream.getAudioTracks().forEach(track => { track.enabled = !micMuted.current; });
      sandboxStreamRef.current = stream; setLocalMicTrack(micMuted.current ? null : stream.getAudioTracks()[0]);
      setIsConnected(true); setIsSandboxMode(true); setVisualizerState("LISTENING"); setPingMs(null); setTurnLatencyMs(null);
      addTranscriptMessage("agent", "Sandbox uses your microphone locally to animate the orb. Audio stays on this device.");
    } catch (error) { setConfigNotice(`Microphone could not start: ${error instanceof Error ? error.message : String(error)}`); }
    finally { if (attempt === generation.current) { busy.current = false; setIsConnecting(false); } }
  }, [addTranscriptMessage]);
  const connect = useCallback(async (deviceId?: string, voice = "auto", speed = 1.05, style = "concise", accessCode = "") => {
    if (busy.current || roomRef.current || sandboxStreamRef.current) return;
    busy.current = true; const attempt = ++generation.current; setIsConnecting(true); setConfigNotice(null);
    try {
      const response = await fetch("/api/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, accessCode }), signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok || !data.isConfigured) throw new Error(data.message || "Voice service is unavailable.");
      if (attempt !== generation.current) { void fetch("/api/session/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lease: data.lease }), keepalive: true }); return; }
      lease.current = data.lease;
      const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (roomRef.current !== room || participant.kind !== ParticipantKind.AGENT || track.kind !== Track.Kind.Audio) return;
        const audio = track.attach(); audio.volume = speakerMuted.current ? 0 : 1; audio.autoplay = true; document.body.appendChild(audio);
        void audio.play().catch(() => { setAudioBlocked(true); setConfigNotice("Tap Enable audio to hear Yuki."); });
        setRemoteAgentTrack(track.mediaStreamTrack);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(element => element.remove()); if (roomRef.current === room) setRemoteAgentTrack(null); });
      room.on(RoomEvent.LocalTrackPublished, () => { if (roomRef.current === room) extractLocalMicTrack(room); });
      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        if (roomRef.current === room) setVisualizerState(speakers.some(participant => participant.kind === ParticipantKind.AGENT) ? "SPEAKING" : "LISTENING");
      });
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (roomRef.current !== room || participant.identity !== room.localParticipant.identity) return;
        const values = { [ConnectionQuality.Excellent]: "EXCELLENT", [ConnectionQuality.Good]: "GOOD", [ConnectionQuality.Poor]: "POOR", [ConnectionQuality.Lost]: "LOST", [ConnectionQuality.Unknown]: "UNKNOWN" } as const;
        setConnectionQuality(values[quality] || "UNKNOWN");
      });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (roomRef.current !== room || participant?.kind !== ParticipantKind.AGENT || topic !== "yuki.control" || payload.length > 24000) return;
        try {
          const packet = JSON.parse(new TextDecoder().decode(payload));
          if (!packet || packet.protocol !== "yuki.control.v1") return;
          if (["ready", "settings_ack"].includes(packet.type) && typeof packet.id === "string") pending.current.get(packet.id)?.resolve();
          if (packet.type === "pong" && typeof packet.id === "string" && Number.isFinite(Number(packet.id))) setPingMs(Math.max(0, Math.round(performance.now() - Number(packet.id))));
          if (packet.type === "telemetry" && Number.isFinite(packet.turn_ms) && packet.turn_ms >= 0) setTurnLatencyMs(packet.turn_ms);
          if (packet.type === "transcript" && ["user", "agent"].includes(packet.sender) && typeof packet.text === "string") { addTranscriptMessage(packet.sender, packet.text); if (packet.sender === "user") setVisualizerState("THINKING"); }
          if (packet.type === "notice" && (packet.message === null || typeof packet.message === "string")) setProviderNotice(packet.message === null ? null : packet.message.slice(0, 500));
          if (packet.type === "error") { disconnect(); setConfigNotice("The voice worker encountered an error. Please start a new call."); }
        } catch { /* Ignore untrusted/malformed data. */ }
      });
      room.on(RoomEvent.ParticipantDisconnected, participant => { if (roomRef.current === room && participant.kind === ParticipantKind.AGENT) { disconnect(); setConfigNotice("The voice worker disconnected. Please try again."); } });
      room.on(RoomEvent.ConnectionStateChanged, state => { if (roomRef.current === room && state === ConnectionState.Disconnected) disconnect(); });
      await room.connect(data.serverUrl, data.token, { peerConnectionTimeout: 15000 });
      const startupTimeout = Math.min(90000, Math.max(20000, Number(data.startupTimeoutMs) || 20000));
      if (startupTimeout > 20000) setConfigNotice("Starting Yuki. The first call after a break may take a little longer. Your microphone will turn on when Yuki is ready.");
      await requestControl(room, "hello", {}, startupTimeout);
      await requestControl(room, "settings", { voice, speed, responseStyle: style });
      if (attempt !== generation.current) return;
      await room.localParticipant.setMicrophoneEnabled(!micMuted.current, { deviceId: deviceId || undefined });
      if (attempt !== generation.current) { room.localParticipant.audioTrackPublications.forEach(publication => publication.track?.stop()); return; }
      extractLocalMicTrack(room); await room.startAudio().catch(() => { setAudioBlocked(true); setConfigNotice("Tap Enable audio to hear Yuki."); });
      setConfigNotice(null); setIsConnected(true); setIsSandboxMode(false); setVisualizerState("LISTENING");
      deadlineTimer.current = setTimeout(() => { disconnect(); setConfigNotice("The call reached its time limit. You can start a new session."); }, Math.max(0, data.deadline - Date.now()));
    } catch (error) {
      if (attempt === generation.current) { disconnect(); setConfigNotice(`Connection could not start: ${error instanceof Error ? error.message : String(error)}`); }
    } finally { if (attempt === generation.current) { busy.current = false; setIsConnecting(false); } }
  }, [addTranscriptMessage, disconnect, extractLocalMicTrack, requestControl]);
  const toggleMic = useCallback(async () => {
    const next = !micMuted.current;
    try {
      if (roomRef.current) await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
      sandboxStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
      micMuted.current = next; setIsMicMuted(next);
      if (roomRef.current) extractLocalMicTrack(roomRef.current);
      else setLocalMicTrack(next ? null : sandboxStreamRef.current?.getAudioTracks()[0] || null);
    } catch { disconnect(); micMuted.current = true; setIsMicMuted(true); setConfigNotice("Microphone control failed. The call ended and mute will be kept for the next call."); }
  }, [extractLocalMicTrack, disconnect]);
  const toggleSpeaker = useCallback(() => {
    speakerMuted.current = !speakerMuted.current; setIsSpeakerMuted(speakerMuted.current);
    roomRef.current?.remoteParticipants.forEach(participant => participant.audioTrackPublications.forEach(publication => publication.track?.attachedElements.forEach(element => { element.volume = speakerMuted.current ? 0 : 1; })));
  }, []);
  const switchActiveDevice = useCallback(async (deviceId: string) => {
    try {
      if (sandboxStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        if (!sandboxStreamRef.current) { stream.getTracks().forEach(track => track.stop()); return false; }
        stream.getAudioTracks().forEach(track => { track.enabled = !micMuted.current; });
        sandboxStreamRef.current.getTracks().forEach(track => track.stop()); sandboxStreamRef.current = stream;
        setLocalMicTrack(micMuted.current ? null : stream.getAudioTracks()[0]);
      } else if (roomRef.current) { const room = roomRef.current; const switched = await room.switchActiveDevice("audioinput", deviceId); if (switched === false) throw new Error("Device unavailable"); if (roomRef.current !== room) return false; await room.localParticipant.setMicrophoneEnabled(!micMuted.current); extractLocalMicTrack(room); }
    return true;
    } catch { if (roomRef.current) disconnect(); setConfigNotice("The selected microphone is unavailable. Please choose another microphone before starting a call."); return false; }
  }, [extractLocalMicTrack, disconnect]);
  useEffect(() => {
    if (!isConnected || isSandboxMode) return;
    const interval = setInterval(() => { const room = roomRef.current; if (room?.state === ConnectionState.Connected) void room.localParticipant.publishData(encode({ type: "ping", id: String(performance.now()) }), { reliable: false, topic: "yuki.control" }).catch(() => {}); }, 3000);
    return () => clearInterval(interval);
  }, [isConnected, isSandboxMode]);
  useEffect(() => {
    const end = () => cleanup(); window.addEventListener("pagehide", end);
    return () => { window.removeEventListener("pagehide", end); cleanup(); };
  }, [cleanup]);
  const resumeAudio = useCallback(async () => {
    try { await roomRef.current?.startAudio(); setAudioBlocked(false); setConfigNotice(null); }
    catch { setConfigNotice("Audio could not be enabled. Check this browser's site audio settings."); }
  }, []);
  return { audioBlocked, resumeAudio, isConnected, isConnecting, isSandboxMode, visualizerState, isMicMuted, isSpeakerMuted, messages, configNotice: configNotice || providerNotice, pingMs, turnLatencyMs, connectionQuality, localMicTrack, remoteAgentTrack, connect, disconnect, toggleConnect: (deviceId?: string, voice?: string, speed?: number, style?: string, accessCode?: string) => isConnected ? disconnect() : void connect(deviceId, voice, speed, style, accessCode), toggleMic, toggleSpeaker, sendSettings, clearMessages: () => setMessages([]), switchActiveDevice, startSandbox, stopSandbox: disconnect };
}
