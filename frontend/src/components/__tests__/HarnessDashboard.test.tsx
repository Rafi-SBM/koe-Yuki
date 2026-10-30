import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HarnessDashboard } from "../HarnessDashboard";

describe("HarnessDashboard Component", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          primaryEngine: "langfuse",
          observability: {
            langfuse: {
              configured: true,
              host: "https://cloud.langfuse.com",
              isSelfHosted: false,
              license: "MIT (Open-Source / Free)",
            },
          },
          infrastructure: {
            livekitReady: true,
            groqKeysCount: 6,
            model: "openai/gpt-oss-120b",
            ttsModel: "Kokoro-82M ONNX v1.0",
            sttModel: "Whisper Large v3 (Groq LPU)",
          },
        }),
      })
    );
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    isConnected: true,
    isSandboxMode: false,
    pingMs: 42,
    turnLatencyMs: 380,
    quality: "EXCELLENT" as const,
    speechSpeed: 1.0,
    responseStyle: "concise",
    onSpeedChange: vi.fn(),
    onResponseStyleChange: vi.fn(),
  };

  it("returns null when isOpen is false", () => {
    const { container } = render(
      <HarnessDashboard {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when isOpen is true with tab navigation", () => {
    render(<HarnessDashboard {...defaultProps} />);
    expect(screen.getByText("Harness & Observability Suite")).toBeDefined();
    expect(screen.getByText("Observability")).toBeDefined();
    expect(screen.getByText("Benchmarks")).toBeDefined();
    expect(screen.getByText("Key Pool")).toBeDefined();
    expect(screen.getByText("Live Tuning")).toBeDefined();
  });

  it("switches tabs when clicked", () => {
    render(<HarnessDashboard {...defaultProps} />);
    const benchmarksTab = screen.getByText("Benchmarks");
    fireEvent.click(benchmarksTab);
    expect(screen.getByText("Automated Subsystem Audit")).toBeDefined();

    const keyPoolTab = screen.getByText("Key Pool");
    fireEvent.click(keyPoolTab);
    expect(screen.getByText("Groq Multi-Key Pool Status")).toBeDefined();

    const tuningTab = screen.getByText("Live Tuning");
    fireEvent.click(tuningTab);
    expect(screen.getByText("Voice Synthesis Speed")).toBeDefined();
  });

  it("calls onClose when the close button is clicked", () => {
    const onCloseMock = vi.fn();
    render(<HarnessDashboard {...defaultProps} onClose={onCloseMock} />);
    const closeButton = screen.getByLabelText(/close harness dashboard/i);
    fireEvent.click(closeButton);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
  it("keeps diagnostics failures inside the dialog", async () => {
    const normalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url, options) => options?.method === "POST"
      ? Promise.resolve({ ok: false, json: async () => ({ message: "Retry in thirty seconds." }) })
      : normalFetch(url, options)));
    render(<HarnessDashboard {...defaultProps} />);
    fireEvent.click(screen.getByText("Benchmarks"));
    fireEvent.click(screen.getByText("Show test commands"));
    await waitFor(() => expect(screen.getByText("Retry in thirty seconds.")).toBeDefined());
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});
