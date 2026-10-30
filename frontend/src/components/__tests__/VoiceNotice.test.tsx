import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoiceNotice } from "../VoiceNotice";

describe("VoiceNotice Component", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(<VoiceNotice message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders alert role with message text when provided", () => {
    render(<VoiceNotice message="Microphone permission required" />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain("Microphone permission required");
  });
});
