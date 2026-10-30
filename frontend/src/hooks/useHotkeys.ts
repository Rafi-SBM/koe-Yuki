"use client";

import { useEffect } from "react";

interface HotkeyHandlers {
  isConnected: boolean;
  isCommandPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isHarnessOpen?: boolean;
  onToggleCommandPalette: () => void;
  onToggleMic: () => void;
  onToggleTranscript: () => void;
  onToggleSpeaker: () => void;
  onOpenSettings: () => void;
  onToggleHarness?: () => void;
}

export function useHotkeys({
  isConnected,
  isCommandPaletteOpen,
  isSettingsOpen,
  isHarnessOpen = false,
  onToggleCommandPalette,
  onToggleMic,
  onToggleTranscript,
  onToggleSpeaker,
  onOpenSettings,
  onToggleHarness,
}: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT" ||
        (document.activeElement as HTMLElement)?.isContentEditable ||
        (e.code === "Space" && document.activeElement?.tagName === "BUTTON")
      ) {
        return;
      }

      // Cmd+K or Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggleCommandPalette();
        return;
      }

      // Cmd+H or Ctrl+H -> Harness Dashboard
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h" && onToggleHarness) {
        e.preventDefault();
        onToggleHarness();
        return;
      }

      // If modal or palette is open, don't intercept standard single key shortcuts
      if (isCommandPaletteOpen || isSettingsOpen || isHarnessOpen) {
        return;
      }

      // Space -> Toggle Mic when connected
      if (e.code === "Space" && isConnected) {
        e.preventDefault();
        onToggleMic();
      }
      // T -> Toggle Transcript
      else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        onToggleTranscript();
      }
      // S -> Toggle Speaker
      else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        onToggleSpeaker();
      }
      // , -> Settings
      else if (e.key === ",") {
        e.preventDefault();
        onOpenSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isConnected,
    isCommandPaletteOpen,
    isSettingsOpen,
    isHarnessOpen,
    onToggleCommandPalette,
    onToggleMic,
    onToggleTranscript,
    onToggleSpeaker,
    onOpenSettings,
    onToggleHarness,
  ]);
}
