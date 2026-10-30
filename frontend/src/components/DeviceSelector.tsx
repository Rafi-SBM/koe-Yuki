"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, Check, ChevronDown, ShieldAlert } from "lucide-react";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  isVirtual: boolean;
}

interface DeviceSelectorProps {
  selectedDeviceId?: string;
  onSelectDevice: (deviceId: string) => void;
  localAudioTrack: MediaStreamTrack | null;
  disabled?: boolean;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  selectedDeviceId,
  onSelectDevice,
  localAudioTrack,
  disabled = false,
}) => {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setIsOpen(false); dropdownRef.current?.querySelector("button")?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [isOpen]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Enumerate Audio Input Devices
  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const virtualKeywords = [
        "blackhole",
        "camo",
        "virtual",
        "aggregate",
        "quicktime",
        "loopback",
        "soundflower",
      ];

      const audioInputs: AudioInputDevice[] = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d, index) => {
          const label = d.label || `Microphone ${index + 1}`;
          const isVirtual = virtualKeywords.some((kw) =>
            label.toLowerCase().includes(kw)
          );
          return {
            deviceId: d.deviceId,
            label,
            isVirtual,
          };
        });

      setDevices(audioInputs);
    } catch (err) {
      console.warn("[DeviceSelector] Error enumerating devices:", err);
    }
  };

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", loadDevices);
    };
  }, []);

  // 2. Measure Live VU Audio Level from Local Track
  useEffect(() => {
    if (!localAudioTrack || localAudioTrack.readyState === "ended") {
      setAudioLevel(0);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;

      const stream = new MediaStream([localAudioTrack]);
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn("[DeviceSelector] VU meter setup error:", err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
    };
  }, [localAudioTrack]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Choose non-virtual hardware mic as fallback default
  const nonVirtualDevices = devices.filter((d) => !d.isVirtual);
  const activeDevice =
    devices.find((d) => d.deviceId === selectedDeviceId) ||
    nonVirtualDevices[0] ||
    devices[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Device Selector Pill Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-xl border transition-all duration-200 ${
          isOpen
            ? "bg-zinc-800/90 border-zinc-600 text-zinc-100 shadow-xl"
            : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/70 hover:border-zinc-700 hover:text-zinc-100 active:scale-95"
        } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        title="Audio Input Device"
      >
        <div className="relative flex items-center justify-center">
          <Mic className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
          {audioLevel > 10 && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          )}
        </div>

        {/* Device Name */}
        <span className="max-w-[120px] sm:max-w-[150px] truncate text-[11px] font-sans">
          {activeDevice ? activeDevice.label : "Microphone"}
        </span>

        {/* Live Audio Level Dots */}
        <div className="flex items-center gap-0.5">
          {[15, 35, 65].map((threshold, i) => (
            <span
              key={i}
              className={`w-1 h-2 rounded-full transition-all duration-75 ${
                audioLevel >= threshold
                  ? i === 2
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                  : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <ChevronDown
          className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-zinc-300" : ""
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 bottom-full mb-2 w-72 sm:w-80 rounded-2xl bg-[#0e121b]/95 border border-zinc-800 backdrop-blur-2xl shadow-2xl z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400">
              Input Devices
            </span>
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
              <span>Live Level: {audioLevel}%</span>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1 space-y-1">
            {devices.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">
                No microphones detected.
              </div>
            ) : (
              devices.map((device) => {
                const isSelected =
                  device.deviceId === selectedDeviceId ||
                  (!selectedDeviceId && device === devices[0]);

                return (
                  <button
                    key={device.deviceId || device.label}
                    onClick={() => {
                      onSelectDevice(device.deviceId);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs transition-colors duration-100 ${
                      isSelected
                        ? "bg-sky-500/15 text-sky-200 font-medium border border-sky-500/25"
                        : "text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Mic
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isSelected ? "text-sky-400" : "text-zinc-500"
                        }`}
                      />
                      <div className="truncate">
                        <p className="truncate text-[11px]">{device.label}</p>
                        {device.isVirtual && (
                          <span className="inline-flex items-center gap-1 text-[9px] text-amber-400/90">
                            <ShieldAlert className="w-2.5 h-2.5" /> Virtual Device
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
