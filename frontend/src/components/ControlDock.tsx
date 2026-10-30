"use client";

import React from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  Volume2,
  VolumeX,
  MessageSquare,
  Activity,
  Radio,
  SlidersHorizontal,
  Command,
} from "lucide-react";
import { ColorTheme } from "./ThemeSelector";
import { VisualizerState } from "./VoiceVisualizer";
import { DeviceSelector } from "./DeviceSelector";

interface ControlDockProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  state: VisualizerState;
  currentTheme: ColorTheme;
  isTranscriptOpen: boolean;
  unreadCount?: number;
  pingMs?: number | null;
  localAudioTrack: MediaStreamTrack | null;
  selectedDeviceId?: string;
  onSelectDevice: (deviceId: string) => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onToggleConnect: () => void;
  onToggleTranscript: () => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  isConnected,
  isConnecting,
  isMicMuted,
  isSpeakerMuted,
  state,
  isTranscriptOpen,
  unreadCount = 0,
  pingMs = null,
  localAudioTrack,
  selectedDeviceId,
  onSelectDevice,
  onToggleMic,
  onToggleSpeaker,
  onToggleConnect,
  onToggleTranscript,
  onOpenSettings,
  onOpenCommandPalette,
}) => {
  // State description text & badge styles
  const getStateInfo = () => {
    if (isConnecting) return { label: "Connecting", dotColor: "bg-amber-400" };
    if (!isConnected) return { label: "Standby", dotColor: "bg-zinc-600" };
    switch (state) {
      case "LISTENING":
        return { label: "Listening", dotColor: "bg-emerald-400" };
      case "THINKING":
        return { label: "Thinking", dotColor: "bg-purple-400" };
      case "SPEAKING":
        return { label: "Yuki Speaking", dotColor: "bg-sky-400" };
      default:
        return { label: "Ready", dotColor: "bg-blue-400" };
    }
  };

  const stateInfo = getStateInfo();

  return (
    <div className="flex flex-col items-center gap-3 select-none w-full max-w-xl px-4">
      {/* Top Helper Bar: Status Badge & Device Selector */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Status Indicator Pill */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/70 border border-zinc-800 backdrop-blur-xl">
          <span className="relative flex h-2 w-2">
            {isConnected && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stateInfo.dotColor}`}
              />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${stateInfo.dotColor}`}
            />
          </span>
          <span className="text-[11px] font-medium text-zinc-300">
            {stateInfo.label}
          </span>

          {isConnected && (
            <>
              <div className="h-2.5 w-px bg-zinc-800" />
              <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                <Activity className="w-3 h-3 text-emerald-500/80" />
                <span>{pingMs == null ? "—" : `${pingMs}ms`}</span>
              </div>
            </>
          )}
        </div>

        {/* Device Selector */}
        <DeviceSelector
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          localAudioTrack={localAudioTrack}
          disabled={isConnecting}
        />

        {/* Quick Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Command Menu (⌘K)"
        >
          <Command className="w-3 h-3" />
          <span>K</span>
        </button>
      </div>

      {/* Main Glassmorphic Control Dock */}
      <div className="flex items-center gap-2 p-2 rounded-full bg-zinc-950/85 border border-zinc-800/80 backdrop-blur-2xl shadow-2xl transition-all duration-300">
        {isConnected ? (
          <>
            {/* Mic Mute Toggle */}
            <button
              onClick={onToggleMic}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
                isMicMuted
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30"
                  : "bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 hover:text-white"
              }`}
              title={isMicMuted ? "Unmute Mic (Space)" : "Mute Mic (Space)"}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Speaker Mute Toggle */}
            <button
              onClick={onToggleSpeaker}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
                isSpeakerMuted
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                  : "bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 hover:text-white"
              }`}
              title={isSpeakerMuted ? "Unmute Audio (S)" : "Mute Audio (S)"}
            >
              {isSpeakerMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {/* Transcript Drawer Toggle */}
            <button
              onClick={onToggleTranscript}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
                isTranscriptOpen
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 hover:text-white"
              }`}
              title="Live Transcript (T)"
            >
              <MessageSquare className="w-4 h-4" />
              {unreadCount > 0 && !isTranscriptOpen && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-sky-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* End Call Button */}
            <button
              onClick={onToggleConnect}
              className="w-11 h-11 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
              title="End Call (Esc)"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </>
        ) : (
          /* Start Conversation Button */
          <button
            onClick={onToggleConnect}
            disabled={isConnecting}
            className="flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-all duration-150 hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-lg shadow-white/5 cursor-pointer"
          >
            {isConnecting ? (
              <>
                <Radio className="w-3.5 h-3.5 animate-spin text-zinc-900" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <PhoneCall className="w-3.5 h-3.5 fill-zinc-900" />
                <span>Start Conversation</span>
              </>
            )}
          </button>
        )}

        <div className="h-5 w-px bg-zinc-800 mx-0.5" />

        {/* Preferences / Settings Button */}
        <button
          onClick={onOpenSettings}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800/80 transition-all duration-150 active:scale-95"
          title="Preferences (,)"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
