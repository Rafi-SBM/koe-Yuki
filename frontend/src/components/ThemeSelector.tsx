"use client";

import React, { useState } from "react";
import { Palette, SlidersHorizontal, Check } from "lucide-react";

export interface ColorTheme {
  id: string;
  name: string;
  primary: string;   // Hex e.g. #007AFF
  secondary: string; // Hex e.g. #38BDF8
  bgGlow: string;    // CSS rgba string
}

export const PRESET_THEMES: ColorTheme[] = [
  {
    id: "chatgpt-blue",
    name: "ChatGPT Blue",
    primary: "#007AFF",
    secondary: "#38BDF8",
    bgGlow: "rgba(0, 122, 255, 0.18)",
  },
  {
    id: "cyber-cyan",
    name: "Cyber Cyan",
    primary: "#06B6D4",
    secondary: "#3B82F6",
    bgGlow: "rgba(6, 182, 212, 0.18)",
  },
  {
    id: "sunset-coral",
    name: "Sunset Coral",
    primary: "#F43F5E",
    secondary: "#FB923C",
    bgGlow: "rgba(244, 63, 94, 0.18)",
  },
  {
    id: "neon-violet",
    name: "Neon Violet",
    primary: "#8B5CF6",
    secondary: "#EC4899",
    bgGlow: "rgba(139, 92, 246, 0.18)",
  },
  {
    id: "emerald-aurora",
    name: "Emerald Aurora",
    primary: "#10B981",
    secondary: "#06D6A0",
    bgGlow: "rgba(16, 185, 129, 0.18)",
  },
  {
    id: "solar-gold",
    name: "Solar Gold",
    primary: "#F59E0B",
    secondary: "#EF4444",
    bgGlow: "rgba(245, 158, 11, 0.18)",
  },
];

interface ThemeSelectorProps {
  currentTheme: ColorTheme;
  onSelectTheme: (theme: ColorTheme) => void;
  onCustomColorChange: (primary: string, secondary: string) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onSelectTheme,
  onCustomColorChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customPrimary, setCustomPrimary] = useState(currentTheme.primary);
  const [customSecondary, setCustomSecondary] = useState(currentTheme.secondary);

  const handleCustomPrimary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomPrimary(val);
    onCustomColorChange(val, customSecondary);
  };

  const handleCustomSecondary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomSecondary(val);
    onCustomColorChange(customPrimary, val);
  };

  return (
    <div className="relative">
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 backdrop-blur-xl text-xs font-medium text-white/90 shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
        title="Customize Palette & Theme"
      >
        <span
          className="w-3.5 h-3.5 rounded-full ring-1 ring-white/30 shadow-sm transition-transform"
          style={{
            background: `linear-gradient(135deg, ${currentTheme.primary}, ${currentTheme.secondary})`,
          }}
        />
        <span className="hidden sm:inline">{currentTheme.name}</span>
        <Palette className="w-3.5 h-3.5 text-white/70 ml-0.5" />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <>
          {/* Backdrop dismiss */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 bottom-full mb-3 w-72 p-4 rounded-2xl bg-neutral-900/90 border border-white/15 backdrop-blur-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold text-white">Visualizer Theme</span>
              </div>
              <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">
                GLSL Shader Bus
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PRESET_THEMES.map((theme) => {
                const isActive = currentTheme.id === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => {
                      onSelectTheme(theme);
                      setCustomPrimary(theme.primary);
                      setCustomSecondary(theme.secondary);
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition-all duration-150 border ${
                      isActive
                        ? "bg-white/15 border-white/30 shadow-md scale-[1.02]"
                        : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10"
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 relative ring-1 ring-white/20 shadow-inner flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                      }}
                    >
                      {isActive && <Check className="w-3 h-3 text-white drop-shadow" />}
                    </div>
                    <span className="text-xs text-white/90 font-medium truncate">
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Tuning */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-medium text-white/70">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Custom RGB Tuning</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5 border border-white/10">
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={handleCustomPrimary}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    title="Primary Core Color"
                  />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-white/50">Primary</span>
                    <span className="text-[10px] font-mono text-white/80 uppercase">
                      {customPrimary}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5 border border-white/10">
                  <input
                    type="color"
                    value={customSecondary}
                    onChange={handleCustomSecondary}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    title="Secondary Wave Accent"
                  />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-white/50">Accent</span>
                    <span className="text-[10px] font-mono text-white/80 uppercase">
                      {customSecondary}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
