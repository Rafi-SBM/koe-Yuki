"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Download,
  Trash2,
  Search,
  ArrowDown,
} from "lucide-react";

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
}

interface TranscriptDrawerProps {
  isOpen: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  onClear?: () => void;
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  isOpen,
  messages,
  onClose,
  onClear,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]')) { event.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  // Filter messages by search query
  const filteredMessages = messages.filter((m) =>
    m.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Copy full transcript
  const handleCopyTranscript = async () => {
    const text = messages
      .map((m) => `[${m.timestamp}] ${m.sender === "agent" ? "Yuki" : "You"}: ${m.text}`)
      .join("\n\n");
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export conversation as Markdown file
  const handleExportMarkdown = () => {
    const header = `# Yuki Voice AI — Transcript\nDate: ${new Date().toLocaleString()}\n\n---\n\n`;
    const body = messages
      .map(
        (m) =>
          `**${m.sender === "agent" ? "Yuki" : "User"}** *(${m.timestamp})*\n\n${m.text}\n`
      )
      .join("\n---\n\n");

    const blob = new Blob([header + body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yuki-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div role="region" aria-label="Conversation transcript" className="w-full max-w-xl mb-3 rounded-2xl bg-[#0c0f17]/95 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-80 sm:max-h-96 transition-all duration-200 animate-in slide-in-from-bottom-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200">
            Transcript
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            ({messages.length})
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyTranscript}
            disabled={messages.length === 0}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30"
            title="Copy Transcript"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={handleExportMarkdown}
            disabled={messages.length === 0}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30"
            title="Export as Markdown"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {onClear && (
            <button
              onClick={onClear}
              disabled={messages.length === 0}
              className="p-1 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-30"
              title="Clear Transcript"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="h-3.5 w-px bg-zinc-800 mx-1" />

          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Close Drawer (T)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Input */}
      <div className="px-4 py-1.5 border-b border-zinc-800/80 bg-zinc-950/20 flex items-center gap-2">
        <Search className="w-3 h-3 text-zinc-500" />
        <input
          type="text"
          placeholder="Filter conversation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Message List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth text-xs"
      >
        {filteredMessages.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            {searchQuery
              ? "No matching messages found."
              : "No spoken turns yet. Speak to begin."}
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isAgent = msg.sender === "agent";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isAgent ? "items-start" : "items-end"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-zinc-500 font-mono">
                  <span className={isAgent ? "text-sky-400 font-semibold" : "text-zinc-300 font-semibold"}>
                    {isAgent ? "Yuki" : "You"}
                  </span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed ${
                    isAgent
                      ? "bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-sm"
                      : "bg-sky-500/15 text-sky-100 border border-sky-500/30 rounded-tr-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer Helper */}
      <div className="px-4 py-1.5 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Press T to toggle</span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 hover:text-zinc-300 transition-colors ${
            autoScroll ? "text-sky-400" : "text-zinc-500"
          }`}
        >
          <ArrowDown className="w-2.5 h-2.5" />
          <span>Auto-Scroll {autoScroll ? "ON" : "OFF"}</span>
        </button>
      </div>
    </div>
  );
};
