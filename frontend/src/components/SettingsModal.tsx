"use client";
import { useDialogFocus } from "@/hooks/useDialogFocus";

import React, { useState } from "react";
import {
  X,
  Sliders,
  Check,
  Activity,
  Play,
  Square,
} from "lucide-react";
import { PRESET_THEMES, ColorTheme } from "./ThemeSelector";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ColorTheme;
  customPrimary: string;
  customSecondary: string;
  onSelectTheme: (theme: ColorTheme) => void;
  onCustomColorChange: (primary: string, secondary: string) => void;
  pingMs?: number | null;
  selectedVoice: string;
  responseStyle: string;
  speechSpeed: number;
  onVoiceChange: (voice: string) => void;
  onResponseStyleChange: (style: string) => void;
  onSpeechSpeedChange: (speed: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  customPrimary,
  customSecondary,
  onSelectTheme,
  onCustomColorChange,
  pingMs = null,
  selectedVoice,
  responseStyle,
  speechSpeed,
  onVoiceChange,
  onResponseStyleChange,
  onSpeechSpeedChange,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "voice" | "appearance" | "shortcuts">("general");
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const stopPreview = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewingVoice(null);
  };

  const previewVoice = (voiceId: string, language: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (previewingVoice === voiceId) {
      stopPreview();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      language === "Japanese" ? "こんにちは、私はユキです。" :
      language === "Spanish" ? "Hola, soy Yuki. Encantada de conocerte." :
      language === "French" ? "Bonjour, je suis Yuki. Ravie de vous rencontrer." :
      language === "Hindi" ? "नमस्ते, मैं युकी हूँ।" :
      language === "Chinese" ? "你好，我是由纪。很高兴认识你。" :
      language === "Italian" ? "Ciao, sono Yuki. Piacere di conoscerti." :
      "Hello, I’m Yuki. Let’s make something wonderful together."
    );
    utterance.rate = speechSpeed;
    utterance.pitch = 1;
    const languageCode = {
      Japanese: "ja-JP", Spanish: "es-ES", French: "fr-FR", Hindi: "hi-IN",
      Chinese: "zh-CN", Italian: "it-IT", English: "en-US", Multilingual: "en-US",
    }[language] || "en-US";
    utterance.lang = languageCode;
    const browserVoice = window.speechSynthesis.getVoices().find((candidate) =>
      candidate.lang.toLowerCase().startsWith(languageCode.slice(0, 2).toLowerCase())
    );
    if (browserVoice) utterance.voice = browserVoice;
    utterance.onend = () => setPreviewingVoice(null);
    utterance.onerror = () => setPreviewingVoice(null);
    setPreviewingVoice(voiceId);
    window.speechSynthesis.speak(utterance);
  };

  React.useEffect(() => () => stopPreview(), []);
  React.useEffect(() => {
    if (!isOpen) stopPreview();
  }, [isOpen]);

  if (!isOpen) return null;

  const voiceCategories = [
    {
      category: "Auto-Detection (Recommended)",
      voices: [
        {
          id: "auto",
          name: "Smart Auto-Switch",
          lang: "Multilingual",
          accent: "Auto-detects language",
          style: "Switches to native voice (Japanese, Spanish, French, Hindi, English, etc.)",
          gender: "Adaptive",
        },
      ],
    },
    {
      category: "Japanese (日本語)",
      voices: [
        { id: "jf_alpha", name: "Alpha", lang: "Japanese", accent: "Tokyo", style: "Natural & Clear", gender: "Female" },
        { id: "jf_gongitsune", name: "Gongitsune", lang: "Japanese", accent: "Standard", style: "Gentle & Expressive", gender: "Female" },
        { id: "jm_kumo", name: "Kumo", lang: "Japanese", accent: "Standard", style: "Calm & Grounded", gender: "Male" },
      ],
    },
    {
      category: "English (US / UK)",
      voices: [
        { id: "af_bella", name: "Bella", lang: "English", accent: "American", style: "Warm & Conversational", gender: "Female" },
        { id: "af_sarah", name: "Sarah", lang: "English", accent: "American", style: "Crisp & Professional", gender: "Female" },
        { id: "am_adam", name: "Adam", lang: "English", accent: "American", style: "Deep & Grounded", gender: "Male" },
        { id: "am_michael", name: "Michael", lang: "English", accent: "American", style: "Energetic & Direct", gender: "Male" },
        { id: "bf_emma", name: "Emma", lang: "English", accent: "British", style: "Refined & Articulate", gender: "Female" },
        { id: "bm_george", name: "George", lang: "English", accent: "British", style: "Authoritative & Warm", gender: "Male" },
      ],
    },
    {
      category: "Spanish (Español)",
      voices: [
        { id: "ef_dora", name: "Dora", lang: "Spanish", accent: "Castilian / Latin", style: "Warm & Fluent", gender: "Female" },
        { id: "em_alex", name: "Alex", lang: "Spanish", accent: "Castilian / Latin", style: "Clear & Modern", gender: "Male" },
      ],
    },
    {
      category: "French (Français)",
      voices: [
        { id: "ff_siwis", name: "Siwis", lang: "French", accent: "Standard", style: "Elegant & Melodic", gender: "Female" },
      ],
    },
    {
      category: "Hindi (हिन्दी)",
      voices: [
        { id: "hf_alpha", name: "Alpha", lang: "Hindi", accent: "Standard", style: "Warm & Articulate", gender: "Female" },
        { id: "hm_omega", name: "Omega", lang: "Hindi", accent: "Standard", style: "Deep & Calm", gender: "Male" },
      ],
    },
    {
      category: "Chinese (中文)",
      voices: [
        { id: "zf_xiaobei", name: "Xiaobei", lang: "Chinese", accent: "Mandarin", style: "Crisp & Natural", gender: "Female" },
        { id: "zm_yunjian", name: "Yunjian", lang: "Chinese", accent: "Mandarin", style: "Smooth & Polite", gender: "Male" },
      ],
    },
    {
      category: "Italian (Italiano)",
      voices: [
        { id: "if_sara", name: "Sara", lang: "Italian", accent: "Standard", style: "Lively & Clear", gender: "Female" },
      ],
    },
  ];

  const shortcuts = [
    { key: "Space", action: "Toggle Microphone Mute / Unmute" },
    { key: "⌘K / Ctrl+K", action: "Open Command Palette" },
    { key: "T", action: "Toggle Conversation Transcript Drawer" },
    { key: "S", action: "Toggle Agent Voice Output Mute" },
    { key: ",", action: "Open Settings Modal" },
    { key: "Esc", action: "Close Drawer / Cancel Modal" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Modal Dialog Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-modal-title"
        className="relative w-full max-w-xl rounded-2xl bg-[#0c0f17] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/30">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
              <Sliders className="w-3.5 h-3.5 text-zinc-200" aria-hidden="true" />
            </div>
            <div>
              <h2 id="preferences-modal-title" className="text-sm font-semibold text-zinc-100">
                Preferences
              </h2>
              <p className="text-[11px] text-zinc-400">Configure multilingual voices, visuals, and behavior</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preferences modal"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-2.5 border-b border-zinc-800/80 bg-zinc-950/40">
          <button
            onClick={() => setActiveTab("general")}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === "general"
                ? "bg-[#0c0f17] text-zinc-100 border-t border-x border-zinc-800"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("voice")}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === "voice"
                ? "bg-[#0c0f17] text-zinc-100 border-t border-x border-zinc-800"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Voice & Language
          </button>
          <button
            onClick={() => setActiveTab("appearance")}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === "appearance"
                ? "bg-[#0c0f17] text-zinc-100 border-t border-x border-zinc-800"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === "shortcuts"
                ? "bg-[#0c0f17] text-zinc-100 border-t border-x border-zinc-800"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Shortcuts
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TAB: GENERAL */}
          {activeTab === "general" && (
            <div className="space-y-5 text-xs">
              <div>
                <p className="block text-zinc-300 font-medium mb-1.5">
                  Conversation Response Length
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "concise", label: "Concise", desc: "1-2 snappy sentences (Default)" },
                    { id: "balanced", label: "Balanced", desc: "Natural conversational flow" },
                    { id: "detailed", label: "Detailed", desc: "Comprehensive step-by-step" },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => onResponseStyleChange(style.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        responseStyle === style.id
                          ? "bg-sky-500/10 border-sky-500/40 text-sky-200"
                          : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      <p className="font-semibold text-zinc-200">{style.label}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium">Barge-in / Interruption Handling</span>
                  <span className="text-[11px] font-mono text-emerald-400">Active (200ms)</span>
                </div>
                <p className="text-zinc-500 text-[11px]">
                  Allows you to speak and naturally interrupt Yuki mid-sentence.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-zinc-300 font-medium block">WebRTC Roundtrip Latency</span>
                  <span className="text-zinc-500 text-[11px]">LiveKit Cloud SFU connection health</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs">
                  <Activity className="w-3 h-3" />
                  <span>{pingMs == null ? "—" : `${pingMs} ms`}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: VOICE & LANGUAGE */}
          {activeTab === "voice" && (
            <div className="space-y-5 text-xs">
              <div className="space-y-4">
                {voiceCategories.map((group) => (
                  <div key={group.category}>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      {group.category}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.voices.map((voice) => {
                        const isSelected = selectedVoice === voice.id;
                        return (
                          <div
                            key={voice.id}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isSelected
                                ? "bg-sky-500/15 border-sky-500/50 text-sky-100 shadow-md shadow-sky-500/5"
                                : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                            }`}
                          >
                            <button type="button" onClick={() => onVoiceChange(voice.id)} className="w-full text-left">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-zinc-200">{voice.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                              </div>
                              <p className="text-[10px] text-zinc-400 mt-1">
                                {voice.gender} • {voice.style}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => previewVoice(voice.id, voice.lang)}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-950/50 px-2 py-1 text-[10px] font-medium text-zinc-300 transition-colors hover:border-sky-400/50 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                              aria-label={`${previewingVoice === voice.id ? "Stop" : "Preview"} ${voice.name} voice`}
                            >
                              {previewingVoice === voice.id ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                              {previewingVoice === voice.id ? "Stop preview" : "Preview"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-zinc-800/80">
                <p className="mb-3 text-[10px] leading-relaxed text-zinc-500">
                  Preview uses your browser&apos;s local speech engine. The live call uses the selected Kokoro voice on the worker.
                </p>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="preferences-speed" className="text-zinc-300 font-medium">Speech Speed</label>
                  <span className="font-mono text-zinc-400">{speechSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  id="preferences-speed"
                  min={0.85}
                  max={1.3}
                  step={0.05}
                  value={speechSpeed}
                  onChange={(e) => onSpeechSpeedChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>0.85x (Relaxed)</span>
                  <span>1.05x (Conversational)</span>
                  <span>1.30x (Rapid)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: APPEARANCE */}
          {activeTab === "appearance" && (
            <div className="space-y-5 text-xs">
              <div>
                <p className="block text-zinc-300 font-medium mb-2.5">
                  Visualizer Atmosphere Palettes
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_THEMES.map((theme) => {
                    const isSelected = currentTheme.name === theme.name;
                    return (
                      <button
                        key={theme.name}
                        onClick={() => onSelectTheme(theme)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-zinc-800/90 border-zinc-600 text-zinc-100 shadow-md"
                            : "bg-zinc-900/40 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                        }`}
                      >
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                          style={{
                            background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                          }}
                        />
                        <span className="truncate text-xs font-medium">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Hex Tuner */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                <span className="text-zinc-300 font-medium block">Custom Dual Gradient</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="core-color" className="text-[10px] text-zinc-500 block mb-1">Core Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="core-color"
                        value={customPrimary}
                        onChange={(e) => onCustomColorChange(e.target.value, customSecondary)}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        aria-label="Core color hex code"
                        value={customPrimary}
                        onChange={(e) => onCustomColorChange(e.target.value, customSecondary)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="corona-color" className="text-[10px] text-zinc-500 block mb-1">Corona Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="corona-color"
                        value={customSecondary}
                        onChange={(e) => onCustomColorChange(customPrimary, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        aria-label="Corona color hex code"
                        value={customSecondary}
                        onChange={(e) => onCustomColorChange(customPrimary, e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-200"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SHORTCUTS */}
          {activeTab === "shortcuts" && (
            <div className="space-y-2">
              {shortcuts.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/30 border border-zinc-800/60 text-xs"
                >
                  <span className="text-zinc-300">{s.action}</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-300">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
