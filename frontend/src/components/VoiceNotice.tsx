"use client";

import React from "react";
import { Info, Play } from "lucide-react";

interface VoiceNoticeProps {
  message: string | null;
  onStartSandbox?: () => void;
  onResumeAudio?: () => void;
}

export function VoiceNotice({ message, onStartSandbox, onResumeAudio }: VoiceNoticeProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="relative z-30 max-w-md mx-auto px-4 w-full animate-fadeIn"
    >
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs backdrop-blur-xl">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 text-[11px] leading-relaxed">{message}</div>
        </div>
        {onResumeAudio && <button type="button" onClick={onResumeAudio} className="voice-notice__audio">Enable audio</button>}
        {onStartSandbox && (
          <div className="pl-6.5 pt-0.5">
            <button
              type="button"
              onClick={onStartSandbox}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-medium text-amber-200 transition-colors"
            >
              <Play className="w-3 h-3" />
              Launch Sandbox Demo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
