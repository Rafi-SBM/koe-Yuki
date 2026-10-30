"use client";
import { useDialogFocus } from "@/hooks/useDialogFocus";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
  MessageSquare,
  Sliders,
  Palette,
  Download,
  Activity,
} from "lucide-react";
import { PRESET_THEMES, ColorTheme } from "./ThemeSelector";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  isTranscriptOpen: boolean;
  onToggleConnect: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onToggleTranscript: () => void;
  onOpenSettings: () => void;
  onOpenHarness?: () => void;
  onSelectTheme: (theme: ColorTheme) => void;
  onExportTranscript?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  isConnected,
  isMicMuted,
  isSpeakerMuted,
  isTranscriptOpen,
  onToggleConnect,
  onToggleMic,
  onToggleSpeaker,
  onToggleTranscript,
  onOpenSettings,
  onOpenHarness,
  onSelectTheme,
  onExportTranscript,
}) => {
  const [query, setQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const dialogRef = useDialogFocus(isOpen, onClose);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Command items definitions
  const commands = [
    {
      id: "toggle-call",
      title: isConnected ? "End Voice Call" : "Start Voice Conversation",
      category: "Action",
      icon: isConnected ? PhoneOff : PhoneCall,
      shortcut: "↵",
      action: () => {
        onToggleConnect();
        onClose();
      },
    },
    {
      id: "toggle-mic",
      title: isMicMuted ? "Unmute Microphone" : "Mute Microphone",
      category: "Audio",
      icon: isMicMuted ? Mic : MicOff,
      shortcut: "M",
      action: () => {
        onToggleMic();
        onClose();
      },
    },
    {
      id: "toggle-speaker",
      title: isSpeakerMuted ? "Unmute Agent Voice" : "Mute Agent Voice",
      category: "Audio",
      icon: isSpeakerMuted ? Volume2 : VolumeX,
      shortcut: "S",
      action: () => {
        onToggleSpeaker();
        onClose();
      },
    },
    {
      id: "toggle-transcript",
      title: isTranscriptOpen ? "Close Transcript Drawer" : "Open Transcript Drawer",
      category: "View",
      icon: MessageSquare,
      shortcut: "T",
      action: () => {
        onToggleTranscript();
        onClose();
      },
    },
    {
      id: "open-settings",
      title: "Open Preferences & Voice Settings",
      category: "Preferences",
      icon: Sliders,
      shortcut: ",",
      action: () => {
        onOpenSettings();
        onClose();
      },
    },
    ...(onOpenHarness
      ? [
          {
            id: "open-harness",
            title: "Open Harness & Observability Suite",
            category: "Diagnostics",
            icon: Activity,
            shortcut: "H",
            action: () => {
              onOpenHarness();
              onClose();
            },
          },
        ]
      : []),
    ...(onExportTranscript
      ? [
          {
            id: "export-transcript",
            title: "Export Conversation Transcript (.md)",
            category: "Action",
            icon: Download,
            shortcut: "E",
            action: () => {
              onExportTranscript();
              onClose();
            },
          },
        ]
      : []),
    ...PRESET_THEMES.map((theme) => ({
      id: `theme-${theme.name.toLowerCase().replace(/\s+/g, "-")}`,
      title: `Switch Theme to ${theme.name}`,
      category: "Theme",
      icon: Palette,
      shortcut: "",
      action: () => {
        onSelectTheme(theme);
        onClose();
      },
    })),
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev - 1 < 0 ? Math.max(0, filtered.length - 1) : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command Menu"
        className="relative w-full max-w-lg rounded-2xl bg-[#0e121b] border border-white/15 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search actions..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-colors duration-100 ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-200 border border-sky-500/30"
                      : "text-zinc-300 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${
                        isSelected ? "text-sky-400" : "text-zinc-400"
                      }`}
                    />
                    <span className="truncate">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] uppercase font-mono text-zinc-500">
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono text-zinc-400">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Helper */}
        <div className="px-4 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Navigate with ↑ ↓ and Enter</span>
          <span>Yuki Command Menu</span>
        </div>
      </div>
    </div>
  );
};
