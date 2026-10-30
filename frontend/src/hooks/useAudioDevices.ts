"use client";

import { useState, useEffect, useCallback } from "react";

const VIRTUAL_KEYWORDS = [
  "blackhole",
  "camo",
  "virtual",
  "aggregate",
  "quicktime",
  "loopback",
  "soundflower",
];

export function useAudioDevices() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  useEffect(() => {
    const detectDefaultHardwareMic = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        const hardwareMic = audioInputs.find(
          (d) => !VIRTUAL_KEYWORDS.some((kw) => d.label.toLowerCase().includes(kw))
        );
        if (hardwareMic) {
          setSelectedDeviceId(hardwareMic.deviceId);
        }
      } catch {
        // Ignored in restricted environments
      }
    };
    detectDefaultHardwareMic();
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  return {
    selectedDeviceId,
    setSelectedDeviceId: selectDevice,
  };
}
