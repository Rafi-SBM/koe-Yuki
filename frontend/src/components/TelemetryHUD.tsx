"use client";

import React from "react";
import { Activity, Wifi, Zap, Clock, ShieldCheck, X } from "lucide-react";
import { QualityState } from "@/hooks/useVoiceSession";

interface TelemetryHUDProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  isSandboxMode: boolean;
  pingMs: number | null;
  turnLatencyMs: number | null;
  quality: QualityState;
}

export function TelemetryHUD({
  isOpen,
  onClose,
  isConnected,
  isSandboxMode,
  pingMs,
  turnLatencyMs,
  quality,
}: TelemetryHUDProps) {
  if (!isOpen) return null;

  const getQualityBadge = () => {
    switch (quality) {
      case "EXCELLENT":
        return { label: "Optimal", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
      case "GOOD":
        return { label: "Good", color: "text-sky-400 bg-sky-500/10 border-sky-500/30" };
      case "POOR":
        return { label: "Degraded", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
      case "LOST":
        return { label: "Disconnected", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" };
      default:
        return { label: isConnected ? "Active" : "Standby", color: "text-zinc-400 bg-zinc-800 border-zinc-700" };
    }
  };

  const badge = getQualityBadge();

  return (
    <div
      role="region"
      aria-label="Real-time WebRTC and Audio Telemetry"
      className="absolute top-20 right-4 sm:right-6 z-40 w-72 p-4 rounded-2xl bg-zinc-950/85 backdrop-blur-xl border border-zinc-800/80 shadow-2xl animate-fadeIn text-zinc-300 select-none"
    >
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <span className="text-xs font-semibold text-zinc-200">Diagnostics HUD</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs p-1 rounded-md hover:bg-zinc-800"
          aria-label="Close Diagnostics HUD"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2.5 pt-3 text-[11px]">
        {/* Connection Link State */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-zinc-500" />
            Link Quality
          </span>
          <span className={`px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* Round Trip Time */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-zinc-500" />
            WebRTC RTT (Ping)
          </span>
          <span className="font-mono text-zinc-200">
            {pingMs !== null ? `${pingMs}ms` : "—"}
          </span>
        </div>

        {/* Turn-Around Latency */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            Voice Turn Latency
          </span>
          <span className="font-mono text-emerald-400 font-medium">
            {turnLatencyMs !== null ? `${turnLatencyMs}ms` : "—"}
          </span>
        </div>

        {/* Pipeline Mode */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
          <span className="text-zinc-400 flex items-center gap-1.5">
            {isSandboxMode ? (
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            )}
            Transport Mode
          </span>
          <span className="text-[10px] text-zinc-300">
            {isSandboxMode ? "Interactive Sandbox" : isConnected ? "LiveKit SFU (Cloud)" : "Standby"}
          </span>
        </div>
      </div>
    </div>
  );
}
