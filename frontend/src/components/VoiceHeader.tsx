"use client";

import React from "react";
import { Sliders, Command, Activity, Gauge, AudioWaveform } from "lucide-react";
import { QualityState } from "@/hooks/useVoiceSession";

interface VoiceHeaderProps {
  primaryColor: string;
  secondaryColor: string;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenHarness: () => void;
  onToggleHUD: () => void;
  isHUDOpen: boolean;
  pingMs: number | null;
  quality: QualityState;
  isConnected: boolean;
}

export function VoiceHeader({
  primaryColor,
  secondaryColor,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenHarness,
  onToggleHUD,
  isHUDOpen,
  pingMs,
  quality,
  isConnected,
}: VoiceHeaderProps) {
  const getQualityDot = () => {
    switch (quality) {
      case "EXCELLENT":
        return "bg-emerald-400";
      case "GOOD":
        return "bg-sky-400";
      case "POOR":
        return "bg-amber-400";
      case "LOST":
        return "bg-rose-500";
      default:
        return isConnected ? "bg-emerald-400" : "bg-zinc-500";
    }
  };

  return (
    <header className="relative z-30 w-full px-4 sm:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-200 hover:scale-105 text-sm select-none text-white"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          }}
          aria-hidden="true"
        >
          <AudioWaveform className="w-3.5 h-3.5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
            Yuki
            <span className="text-[10px] text-zinc-400 font-normal tracking-normal">• Twinkle Star</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${getQualityDot()} ml-0.5`}
              title={`Connection: ${quality}`}
              aria-label={`Connection state: ${quality}`}
            />
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleHUD}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            isHUDOpen
              ? "bg-sky-500/20 border-sky-500/40 text-sky-200"
              : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
          }`}
          title="Diagnostics HUD"
          aria-label="Toggle Diagnostics Telemetry HUD"
        >
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-[11px] font-mono">
            {pingMs !== null ? `${pingMs}ms` : isConnected ? "Live" : "HUD"}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenHarness}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-xs text-purple-300 hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          title="Harness & Observability Suite (⌘H)"
          aria-label="Open Harness & Observability Suite (⌘H)"
        >
          <Gauge className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-[11px] font-medium hidden sm:inline">Harness</span>
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 text-xs text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          title="Command Menu (⌘K)"
          aria-label="Open Command Menu (⌘K)"
        >
          <Command className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-[11px] font-mono">⌘K</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          title="Preferences (,)"
          aria-label="Open Preferences"
        >
          <Sliders className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
