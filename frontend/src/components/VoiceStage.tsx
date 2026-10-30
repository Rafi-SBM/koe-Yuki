"use client";

import React from "react";
import { VoiceVisualizer, VisualizerState } from "@/components/VoiceVisualizer";
import { ColorTheme } from "@/components/ThemeSelector";

interface VoiceStageProps {
  state: VisualizerState;
  theme: ColorTheme;
  customPrimaryHex: string;
  customSecondaryHex: string;
  localAudioTrack: MediaStreamTrack | null;
  remoteAudioTrack: MediaStreamTrack | null;
  isConnected: boolean;
}

export function VoiceStage({
  state,
  theme,
  customPrimaryHex,
  customSecondaryHex,
  localAudioTrack,
  remoteAudioTrack,
  isConnected,
}: VoiceStageProps) {
  const getStatusText = (s: VisualizerState) => {
    switch (s) {
      case "SPEAKING":
        return "Yuki is speaking";
      case "THINKING":
        return "Thinking...";
      case "LISTENING":
        return "Listening...";
      case "IDLE":
      default:
        return "Ready to converse";
    }
  };

  return (
    <section
      aria-label="Voice Interaction Stage"
      className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 min-h-0"
    >
      <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] flex items-center justify-center">
        <VoiceVisualizer
          state={state}
          theme={theme}
          customPrimaryHex={customPrimaryHex}
          customSecondaryHex={customSecondaryHex}
          localAudioTrack={localAudioTrack}
          remoteAudioTrack={remoteAudioTrack}
        />
      </div>

      {/* Subtitle / Status indicator */}
      <div className="mt-3 text-center select-none flex flex-col items-center" aria-live="polite">
        <p className="text-xs font-medium text-zinc-300">
          {getStatusText(state)}
        </p>
        <p className="text-[11px] text-zinc-500 mt-1">
          {isConnected ? "Press Space to mute / unmute" : "Click Start Conversation or press ⌘K"}
        </p>
      </div>
    </section>
  );
}
