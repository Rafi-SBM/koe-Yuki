"use client";
import { useDialogFocus } from "@/hooks/useDialogFocus";

import React, { useState, useEffect } from "react";
import {
  X,
  Activity,
  Play,
  CheckCircle2,
  Cpu,
  Layers,
  Sliders,
  ExternalLink,
  Wifi,
  Key,
} from "lucide-react";
import { QualityState } from "@/hooks/useVoiceSession";

interface HarnessDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  isSandboxMode: boolean;
  pingMs: number | null;
  turnLatencyMs: number | null;
  quality: QualityState;
  speechSpeed: number;
  responseStyle: string;
  onSpeedChange: (speed: number) => void;
  onResponseStyleChange: (style: string) => void;
}

type TabType = "observability" | "benchmarks" | "keypool" | "controls";

interface ObservabilityData {
  status: string;
  primaryEngine?: string;
  observability: {
    langfuse: {
      configured: boolean;
      host: string;
      isSelfHosted?: boolean;
      license?: string;
    };
  };
  infrastructure: {
    livekitReady: boolean;
    groqKeysCount: number;
    model: string;
    ttsModel: string;
    sttModel: string;
  };
}

interface BenchmarkData {
  status: string;
  message?: string;
  commands?: string[];
  subsystems: {
    language_routing: {
      status: string;
      testedLanguages: string[];
      score: string;
      accuracy: string | null;
    };
    kokoro_tts: {
      status: string;
      model: string;
    };
    groq_llm: {
      status: string;
      model: string;
    };
    key_pool: {
      status: string;
    };
  };
}

export function HarnessDashboard({
  isOpen,
  onClose,
  isConnected,
  isSandboxMode,
  pingMs,
  turnLatencyMs,
  quality,
  speechSpeed,
  responseStyle,
  onSpeedChange,
  onResponseStyleChange,
}: HarnessDashboardProps) {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<TabType>("observability");
  const [obsData, setObsData] = useState<ObservabilityData | null>(null);
  const [benchData, setBenchData] = useState<BenchmarkData | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRunningBench, setIsRunningBench] = useState<boolean>(false);

  // Fetch observability telemetry from /api/harness
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/harness")
      .then(async (res) => { if (!res.ok) throw new Error("Diagnostics are temporarily unavailable."); return res.json(); })
      .then((data) => {
        if (data?.observability) setObsData(data);
      })
      .catch(() => setRequestError("Diagnostics are temporarily unavailable."));
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleRunBenchmarks = async () => {
    setIsRunningBench(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/harness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.subsystems?.language_routing || !data?.subsystems?.kokoro_tts) throw new Error(data.message || "Unexpected benchmark response.");
      setBenchData(data);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Benchmarks are unavailable.");
    } finally {
      setIsRunningBench(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-dashboard-title"
        className="relative w-full max-w-2xl rounded-2xl bg-[#0b0e17] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {requestError && <p role="alert" className="p-4 text-rose-300">{requestError}</p>}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 id="harness-dashboard-title" className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Harness & Observability Suite
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  Langfuse telemetry
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Interactive control plane, Langfuse session traces, and automated subsystem benchmarks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close harness dashboard"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-6 pt-2.5 border-b border-zinc-800/80 bg-zinc-950/20">
          {[
            { id: "observability", label: "Observability", icon: Activity },
            { id: "benchmarks", label: "Benchmarks", icon: Play },
            { id: "keypool", label: "Key Pool", icon: Key },
            { id: "controls", label: "Live Tuning", icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                  isActive
                    ? "bg-[#0b0e17] text-sky-400 border-t border-x border-zinc-800"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === "observability" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-emerald-500/30 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        Langfuse Telemetry
                        <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 font-mono rounded">
                          PRIMARY
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          obsData?.observability.langfuse.configured
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {obsData?.observability.langfuse.configured ? "Active" : "Fail-Open Ready"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">
                      {obsData?.observability.langfuse.isSelfHosted ? (
                        <span className="text-emerald-400 font-medium">Self-Hosted Local Instance (Unlimited Traces)</span>
                      ) : (
                        <span>Optional cloud or self-hosted trace ingestion</span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                      Host: {obsData?.observability.langfuse.host || "https://cloud.langfuse.com"}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                    <a
                      href={obsData?.observability.langfuse.host || "https://cloud.langfuse.com"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                    >
                      Open Langfuse Dashboard <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-[10px] text-zinc-500">Open dashboard</span>
                  </div>
                </div>

              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
                <h3 className="text-xs font-semibold text-zinc-200 mb-3 flex items-center justify-between">
                  <span>Voice Turn Latency Waterfall</span>
                  <span className="text-[11px] font-mono text-emerald-400">
                    {turnLatencyMs ? `${turnLatencyMs}ms total` : isConnected ? "Awaiting turn" : "Standby"}
                  </span>
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>1. Speech-To-Text (Whisper LPU)</span>
                    <span className="font-mono text-zinc-500">live worker data</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-zinc-700 h-full w-full" />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span>2. LLM Time-To-First-Token (Groq 120B)</span>
                    <span className="font-mono text-zinc-500">live worker data</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-zinc-700 h-full w-full" />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span>3. Kokoro TTS First Chunk (24kHz ONNX)</span>
                    <span className="font-mono text-zinc-500">live worker data</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-zinc-700 h-full w-full" />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="font-medium text-zinc-200">WebRTC RTT (Ping)</span>
                    <p className="text-[10px] text-zinc-500">
                      {isSandboxMode ? "Interactive Sandbox Loop" : isConnected ? "LiveKit SFU Edge" : "Disconnected"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs text-sky-300 font-semibold">
                    {pingMs !== null ? `${pingMs}ms` : "—"}
                  </span>
                  <p className="text-[10px] text-emerald-400">{quality}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "benchmarks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-200">Automated Subsystem Audit</h3>
                  <p className="text-[11px] text-zinc-400">Run the real worker-side checks and bring measured results into this dashboard.</p>
                </div>
                <button
                  type="button"
                  onClick={handleRunBenchmarks}
                  disabled={isRunningBench}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${isRunningBench ? "animate-spin" : ""}`} />
                  {isRunningBench ? "Loading..." : "Show test commands"}
                </button>
              </div>

              {benchData?.message && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3.5 py-3 text-[11px] text-zinc-300">
                  <p>{benchData.message}</p>
                  {benchData.commands && benchData.commands.length > 0 && (
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-sky-200">
                      {benchData.commands.map((command) => (
                        <div key={command}>{command}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Multilingual Routing
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                      {benchData?.subsystems?.language_routing.score || "not measured"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {["en-us", "ja", "es", "fr-fr", "hi", "zh", "it"].map((lang) => (
                      <span key={lang} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      Kokoro-82M ONNX TTS
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 border border-purple-500/30 text-purple-300">
                      not measured
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Run <span className="text-purple-300 font-semibold">agent/eval_harness.py</span> to measure real-time factor on the deployment CPU.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      Groq LLM (120B)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 border border-sky-500/30 text-sky-300">
                      not measured
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    TTFT and throughput are measured only by the live worker-side integration test.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      Key Pool Failover
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300">
                      runtime status
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    The worker reports configured key count and cooldown state; this UI does not invent those values.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "keypool" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-200">Groq Multi-Key Pool Status</h3>
                  <p className="text-[11px] text-zinc-400">Thread-safe round-robin allocation with rate limit tracking</p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium text-[11px]">
                  {obsData?.infrastructure.groqKeysCount || "—"} Keys Reported
                </span>
              </div>

              <div className="space-y-2">
                {Array.from({ length: obsData?.infrastructure.groqKeysCount || 0 }, (_, index) => index + 1).map((num) => (
                  <div
                    key={num}
                    className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="font-mono text-zinc-300">gsk_key_{num}_vault</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-medium">
                        configured
                      </span>
                      <span className="text-zinc-500 text-[10px]">worker-managed</span>
                    </div>
                  </div>
                ))}
              </div>
              {(!obsData?.infrastructure.groqKeysCount) && (
                <p className="text-[11px] text-zinc-500">No worker key count is available yet. Open the dashboard after the worker is configured.</p>
              )}
            </div>
          )}

          {activeTab === "controls" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="harness-speed" className="font-medium text-zinc-200">Voice Synthesis Speed</label>
                  <span className="font-mono text-sky-400">{speechSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  id="harness-speed"
                  min="0.75"
                  max="1.50"
                  step="0.05"
                  value={speechSpeed}
                  onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div>
                <p className="font-medium text-zinc-200 block mb-1.5">Persona Response Pacing</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "concise", label: "Concise", desc: "Short spoken turns" },
                    { id: "balanced", label: "Balanced", desc: "Helpful detail" },
                    { id: "detailed", label: "Detailed", desc: "Comprehensive" },
                  ].map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => onResponseStyleChange(style.id)}
                      className={`p-2 rounded-xl border text-left transition-colors ${
                        responseStyle === style.id
                          ? "bg-sky-500/20 border-sky-500/50 text-sky-200"
                          : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <div className="font-medium text-xs">{style.label}</div>
                      <div className="text-[10px] text-zinc-500">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
