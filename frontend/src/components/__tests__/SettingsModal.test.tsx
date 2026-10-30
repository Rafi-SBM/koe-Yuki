import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "../SettingsModal";
import { PRESET_THEMES } from "../ThemeSelector";
import previews from "@/data/voice-previews.json";

const audio: FakeAudio[] = [];
class FakeAudio {
  src: string;
  playbackRate = 1;
  preservesPitch = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  constructor(src: string) { this.src = src; audio.push(this); }
}
const props = {
  isOpen: true, onClose: vi.fn(), currentTheme: PRESET_THEMES[0],
  customPrimary: "#007AFF", customSecondary: "#38BDF8", onSelectTheme: vi.fn(),
  onCustomColorChange: vi.fn(), selectedVoice: "auto", responseStyle: "concise",
  speechSpeed: 1.05, onVoiceChange: vi.fn(), onResponseStyleChange: vi.fn(), onSpeechSpeedChange: vi.fn(),
};
beforeEach(() => { audio.length = 0; vi.stubGlobal("Audio", FakeAudio); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function openVoices() { fireEvent.click(screen.getByRole("button", { name: "Voice & Language" })); }

describe("real voice previews", () => {
  it("plays different Kokoro audio for voices in the same language and stops previous audio", async () => {
    render(<SettingsModal {...props} />); openVoices();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Preview Alpha Japanese voice" })[0]));
    expect(audio[0].src).toBe(previews.jf_alpha.src);
    expect(audio[0].playbackRate).toBe(1.05);
    expect(audio[0].preservesPitch).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview Gongitsune Japanese voice" })));
    expect(audio[1].src).toBe(previews.jf_gongitsune.src);
    expect(audio[1].src).not.toBe(audio[0].src);
    expect(audio[0].pause).toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview Kumo Japanese voice" })));
    expect(audio[2].src).toBe(previews.jm_kumo.src);
    expect(audio[1].pause).toHaveBeenCalled();
    expect(props.onVoiceChange).not.toHaveBeenCalled();
  });
  it("stops playback on modal close and updates speed without switching voices", async () => {
    const { rerender } = render(<SettingsModal {...props} />); openVoices();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview Bella English voice" })));
    rerender(<SettingsModal {...props} speechSpeed={1.2} />);
    expect(audio[0].playbackRate).toBe(1.2);
    rerender(<SettingsModal {...props} isOpen={false} />);
    expect(audio[0].pause).toHaveBeenCalled();
    expect(audio[0].onended).toBeNull();
    expect(audio[0].onerror).toBeNull();
  });
  it("reports playback failures and lets the user play another voice", async () => {
    render(<SettingsModal {...props} />); openVoices();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview Bella English voice" })));
    act(() => audio[0].onerror?.());
    expect(screen.getByRole("alert").textContent).toContain("could not play");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview Sarah English voice" })));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(audio[1].src).toBe(previews.af_sarah.src);
  });
});
