"use client";

import { useState, useCallback } from "react";
import { PRESET_THEMES, ColorTheme } from "@/components/ThemeSelector";

export function useVoiceSettings() {
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(PRESET_THEMES[0]);
  const [customPrimary, setCustomPrimary] = useState<string>(PRESET_THEMES[0].primary);
  const [customSecondary, setCustomSecondary] = useState<string>(PRESET_THEMES[0].secondary);

  const [selectedVoice, setSelectedVoice] = useState<string>("auto");
  const [responseStyle, setResponseStyle] = useState<string>("concise");
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.05);

  const handleSelectTheme = useCallback((theme: ColorTheme) => {
    setCurrentTheme(theme);
    setCustomPrimary(theme.primary);
    setCustomSecondary(theme.secondary);
  }, []);

  const handleCustomColorChange = useCallback((primary: string, secondary: string) => {
    setCustomPrimary(primary);
    setCustomSecondary(secondary);
  }, []);

  return {
    currentTheme,
    customPrimary,
    customSecondary,
    selectedVoice,
    responseStyle,
    speechSpeed,
    setSelectedVoice,
    setResponseStyle,
    setSpeechSpeed,
    handleSelectTheme,
    handleCustomColorChange,
  };
}
