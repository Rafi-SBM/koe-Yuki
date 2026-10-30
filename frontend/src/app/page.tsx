"use client";

import React, { useState } from "react";
import { CustomCursor } from "@/components/CustomCursor";
import { InteractiveBackgroundOrbs } from "@/components/InteractiveBackgroundOrbs";
import { VoiceHeader } from "@/components/VoiceHeader";
import { VoiceNotice } from "@/components/VoiceNotice";
import { VoiceStage } from "@/components/VoiceStage";
import { ControlDock } from "@/components/ControlDock";
import { TranscriptDrawer } from "@/components/TranscriptDrawer";
import { SettingsModal } from "@/components/SettingsModal";
import { CommandPalette } from "@/components/CommandPalette";
import { TelemetryHUD } from "@/components/TelemetryHUD";
import { HarnessDashboard } from "@/components/HarnessDashboard";

import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useVoiceSettings } from "@/hooks/useVoiceSettings";
import { useHotkeys } from "@/hooks/useHotkeys";

export default function VoiceHubPage() {
  const settings = useVoiceSettings();
  const devices = useAudioDevices();

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isHUDOpen, setIsHUDOpen] = useState(false);
  const [isHarnessOpen, setIsHarnessOpen] = useState(false);

  const session = useVoiceSession();
  const [consent, setConsent] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [showConsentHint, setShowConsentHint] = useState(false);

  // Sync selected input device with active WebRTC room
  const handleSelectDevice = async (deviceId: string) => {
    if (await session.switchActiveDevice(deviceId)) devices.setSelectedDeviceId(deviceId);
  };

  // Sync voice parameters over data channel
  const handleVoiceChange = (voice: string) => {
    settings.setSelectedVoice(voice);
    session.sendSettings(voice, settings.speechSpeed, settings.responseStyle);
  };

  const handleSpeedChange = (speed: number) => {
    settings.setSpeechSpeed(speed);
    session.sendSettings(settings.selectedVoice, speed, settings.responseStyle);
  };

  const handleResponseStyleChange = (style: string) => {
    settings.setResponseStyle(style);
    session.sendSettings(settings.selectedVoice, settings.speechSpeed, style);
  };

  const handleToggleConnect = () => {
    if (!session.isConnected && !consent) { setShowConsentHint(true); document.getElementById("voice-consent")?.focus(); return; }
    session.toggleConnect(
      devices.selectedDeviceId,
      settings.selectedVoice,
      settings.speechSpeed,
      settings.responseStyle,
      accessCode
    );
  };

  // Register global shortcuts
  useHotkeys({
    isConnected: session.isConnected,
    isCommandPaletteOpen,
    isSettingsOpen,
    isHarnessOpen,
    onToggleCommandPalette: () => setIsCommandPaletteOpen((prev) => !prev),
    onToggleMic: session.toggleMic,
    onToggleTranscript: () => setIsTranscriptOpen((prev) => !prev),
    onToggleSpeaker: session.toggleSpeaker,
    onOpenSettings: () => setIsSettingsOpen(true),
    onToggleHarness: () => setIsHarnessOpen((prev) => !prev),
  });

  const handleExportTranscript = () => {
    const header = `# Yuki Voice AI — Conversation Transcript\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n`;
    const body = session.messages
      .map((m) => `**${m.sender === "agent" ? "Yuki" : "User"}**: ${m.text}`)
      .join("\n\n");
    const blob = new Blob([header + body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yuki-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="relative flex flex-col justify-between min-h-screen w-full overflow-hidden bg-[#07090e]">
      <CustomCursor
        primaryColor={settings.customPrimary}
        secondaryColor={settings.customSecondary}
      />

      <InteractiveBackgroundOrbs
        primaryColor={settings.customPrimary}
        secondaryColor={settings.customSecondary}
      />

      <VoiceHeader
        primaryColor={settings.customPrimary}
        secondaryColor={settings.customSecondary}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHarness={() => setIsHarnessOpen(true)}
        onToggleHUD={() => setIsHUDOpen((prev) => !prev)}
        isHUDOpen={isHUDOpen}
        pingMs={session.pingMs}
        quality={session.connectionQuality}
        isConnected={session.isConnected}
      />

      {/* Real-Time Diagnostics HUD Panel */}
      <TelemetryHUD
        isOpen={isHUDOpen}
        onClose={() => setIsHUDOpen(false)}
        isConnected={session.isConnected}
        isSandboxMode={session.isSandboxMode}
        pingMs={session.pingMs}
        turnLatencyMs={session.turnLatencyMs}
        quality={session.connectionQuality}
      />

      <VoiceNotice
        message={session.configNotice}
        onResumeAudio={session.audioBlocked ? session.resumeAudio : undefined}
        onStartSandbox={!session.isConnected && !session.isConnecting ? session.startSandbox : undefined}
      />

      <VoiceStage
        state={session.visualizerState}
        theme={settings.currentTheme}
        customPrimaryHex={settings.customPrimary}
        customSecondaryHex={settings.customSecondary}
        localAudioTrack={session.localMicTrack}
        remoteAudioTrack={session.remoteAgentTrack}
        isConnected={session.isConnected}
      />

      {/* Controls & transcript drawer */}
      <footer className="relative z-20 pb-8 px-4 w-full flex flex-col items-center">
        {!session.isConnected && <div className="voice-consent">
          <p>Live calls send audio to LiveKit and Groq for transcription and responses. Speech is synthesized by the worker. Transcripts stay in this browser tab and are cleared on reload; raw audio and text are not logged by this application. Provider retention follows your operator’s configured policies. Calls end after five minutes by default.</p>
          <label className="voice-consent__choice"><input id="voice-consent" type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setShowConsentHint(false); }} /> I agree to this processing and want to start a live call.</label>
          <label className="voice-consent__code">Access code, if provided <input type="password" autoComplete="off" value={accessCode} onChange={event => setAccessCode(event.target.value)} /></label>
          {showConsentHint && <p role="alert">Please accept the voice processing notice before starting.</p>}
        </div>}
        <TranscriptDrawer
          isOpen={isTranscriptOpen}
          messages={session.messages}
          onClose={() => setIsTranscriptOpen(false)}
          onClear={session.clearMessages}
        />

        <ControlDock
          isConnected={session.isConnected}
          isConnecting={session.isConnecting}
          isMicMuted={session.isMicMuted}
          isSpeakerMuted={session.isSpeakerMuted}
          state={session.visualizerState}
          currentTheme={settings.currentTheme}
          isTranscriptOpen={isTranscriptOpen}
          unreadCount={session.messages.length}
          pingMs={session.pingMs}
          localAudioTrack={session.localMicTrack}
          selectedDeviceId={devices.selectedDeviceId}
          onSelectDevice={handleSelectDevice}
          onToggleMic={session.toggleMic}
          onToggleSpeaker={session.toggleSpeaker}
          onToggleConnect={handleToggleConnect}
          onToggleTranscript={() => setIsTranscriptOpen((prev) => !prev)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={settings.currentTheme}
        customPrimary={settings.customPrimary}
        customSecondary={settings.customSecondary}
        onSelectTheme={settings.handleSelectTheme}
        onCustomColorChange={settings.handleCustomColorChange}
        pingMs={session.pingMs}
        selectedVoice={settings.selectedVoice}
        responseStyle={settings.responseStyle}
        speechSpeed={settings.speechSpeed}
        onVoiceChange={handleVoiceChange}
        onResponseStyleChange={handleResponseStyleChange}
        onSpeechSpeedChange={handleSpeedChange}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        isConnected={session.isConnected}
        isMicMuted={session.isMicMuted}
        isSpeakerMuted={session.isSpeakerMuted}
        isTranscriptOpen={isTranscriptOpen}
        onToggleConnect={handleToggleConnect}
        onToggleMic={session.toggleMic}
        onToggleSpeaker={session.toggleSpeaker}
        onToggleTranscript={() => setIsTranscriptOpen((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHarness={() => setIsHarnessOpen(true)}
        onSelectTheme={settings.handleSelectTheme}
        onExportTranscript={handleExportTranscript}
      />

      <HarnessDashboard
        isOpen={isHarnessOpen}
        onClose={() => setIsHarnessOpen(false)}
        isConnected={session.isConnected}
        isSandboxMode={session.isSandboxMode}
        pingMs={session.pingMs}
        turnLatencyMs={session.turnLatencyMs}
        quality={session.connectionQuality}
        speechSpeed={settings.speechSpeed}
        responseStyle={settings.responseStyle}
        onSpeedChange={handleSpeedChange}
        onResponseStyleChange={handleResponseStyleChange}
      />
    </main>
  );
}
