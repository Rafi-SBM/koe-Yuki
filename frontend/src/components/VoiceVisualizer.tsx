"use client";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { vertexShaderSource, fragmentShaderSource } from "@/shaders";
import { ColorTheme } from "./ThemeSelector";

export type VisualizerState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING";

interface VoiceVisualizerProps {
  state: VisualizerState;
  theme: ColorTheme;
  customPrimaryHex?: string;
  customSecondaryHex?: string;
  localAudioTrack?: MediaStreamTrack | null;
  remoteAudioTrack?: MediaStreamTrack | null;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  state,
  theme,
  customPrimaryHex,
  customSecondaryHex,
  localAudioTrack,
  remoteAudioTrack,
}) => {
  const reducedMotion = useReducedMotion();
  const stateRef = useRef(state);
  stateRef.current = state;
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const uniformsRef = useRef<{ [uniform: string]: THREE.IUniform } | null>(null);
  
  // Web Audio Nodes
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedIntensityRef = useRef<number>(0);

  // Map state string to shader float mode
  const getModeFloat = (s: VisualizerState): number => {
    switch (s) {
      case "IDLE":
        return 0.0;
      case "LISTENING":
        return 1.0;
      case "THINKING":
        return 2.0;
      case "SPEAKING":
        return 3.0;
      default:
        return 0.0;
    }
  };

  const getAudioContext = () => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioCtx();
    if (context.state === "suspended") void context.resume().catch(() => {});
    return context;
  };
  // 1. Bind Local Microphone Track
  useEffect(() => {
    if (!localAudioTrack || reducedMotion) {
      localAnalyserRef.current = null;
      return;
    }

    try {
      const ctx = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;

      const mediaStream = new MediaStream([localAudioTrack]);
      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      localAnalyserRef.current = analyser;
      return () => { source.disconnect(); analyser.disconnect(); localAnalyserRef.current = null; void ctx.close().catch(() => {}); };
    } catch (err) {
      console.warn("Error setting up local mic analyser:", err);
    }
  }, [localAudioTrack, reducedMotion]);

  // 2. Bind Remote Agent Track
  useEffect(() => {
    if (!remoteAudioTrack || reducedMotion) {
      remoteAnalyserRef.current = null;
      return;
    }

    try {
      const ctx = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      const mediaStream = new MediaStream([remoteAudioTrack]);
      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      remoteAnalyserRef.current = analyser;
      return () => { source.disconnect(); analyser.disconnect(); remoteAnalyserRef.current = null; void ctx.close().catch(() => {}); };
    } catch (err) {
      console.warn("Error setting up remote audio analyser:", err);
    }
  }, [remoteAudioTrack, reducedMotion]);

  // 3. Three.js Scene Setup & Render Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 480;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    // WebGL Renderer with High-DPI & Anti-aliasing
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "default",
    }); } catch { container.textContent = "Voice visualization unavailable. Call controls are still available."; return; }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Clear previous canvas
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Color Setup
    const primaryHex = customPrimaryHex || theme.primary;
    const secondaryHex = customSecondaryHex || theme.secondary;
    const primaryColor = new THREE.Color(primaryHex);
    const secondaryColor = new THREE.Color(secondaryHex);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      uniformsRef.current = null; rendererRef.current = null;
      container.textContent = "Voice visualization unavailable. Call controls are still available.";
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    // Uniforms Bus
    const uniforms = {
      u_time: { value: 0.0 },
      u_intensity: { value: 0.0 },
      u_frequency_low: { value: 0.0 },
      u_frequency_mid: { value: 0.0 },
      u_frequency_high: { value: 0.0 },
      u_mode: { value: getModeFloat(state) },
      u_color_primary: { value: primaryColor },
      u_color_secondary: { value: secondaryColor },
      u_resolution: { value: new THREE.Vector2(width, height) },
    };
    uniformsRef.current = uniforms;

    // Fluid Sphere Geometry (Balanced radius 0.80)
    const geometry = new THREE.IcosahedronGeometry(0.80, 32);

    // Shader Material
    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShaderSource,
      fragmentShader: fragmentShaderSource,
      uniforms: uniforms,
      transparent: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      depthWrite: true,
      depthTest: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Background Particle Embers
    const particlesCount = 70;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 5.5;
      particlePositions[i + 1] = (Math.random() - 0.5) * 5.5;
      particlePositions[i + 2] = (Math.random() - 0.5) * 3.5;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.035,
      color: primaryColor,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    const freqData = new Uint8Array(128);
    const clock = new THREE.Clock();

    // Animation Loop
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      let activeIntensity = 0.0;
      let lowBand = 0.0;
      let midBand = 0.0;
      let highBand = 0.0;

      // Tap active audio analyser (local mic or remote agent)
      const activeAnalyser =
        stateRef.current === "SPEAKING" ? remoteAnalyserRef.current : localAnalyserRef.current;

      if (activeAnalyser) {
        activeAnalyser.getByteFrequencyData(freqData);

        let sum = 0;
        let sumLow = 0;
        let sumMid = 0;
        let sumHigh = 0;

        for (let i = 0; i < 64; i++) {
          const val = freqData[i] / 255.0;
          sum += val * val;
          if (i < 8) sumLow += val;
          else if (i < 28) sumMid += val;
          else sumHigh += val;
        }

        const rms = Math.sqrt(sum / 64);
        activeIntensity = Math.min(1.0, rms * 2.4);
        lowBand = sumLow / 8;
        midBand = sumMid / 20;
        highBand = sumHigh / 36;
      }

      // Smooth intensity
      smoothedIntensityRef.current += (activeIntensity - smoothedIntensityRef.current) * 0.2;
      const smoothVal = Math.min(1.0, smoothedIntensityRef.current);

      if (uniformsRef.current) {
        uniformsRef.current.u_time.value = elapsedTime;
        uniformsRef.current.u_intensity.value = smoothVal;
        uniformsRef.current.u_frequency_low.value = lowBand;
        uniformsRef.current.u_frequency_mid.value = midBand;
        uniformsRef.current.u_frequency_high.value = highBand;
      }

      mesh.rotation.y = elapsedTime * 0.12;
      mesh.rotation.z = Math.sin(elapsedTime * 0.15) * 0.08;
      particleSystem.rotation.y = elapsedTime * 0.03;

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      if (uniformsRef.current) {
        uniformsRef.current.u_resolution.value.set(newWidth, newHeight);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      geometry.dispose();
      material.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
      rendererRef.current = null; uniformsRef.current = null;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Update Dynamic Uniforms on Prop Changes
  useEffect(() => {
    if (!uniformsRef.current) return;
    uniformsRef.current.u_mode.value = getModeFloat(state);
    const primaryHex = customPrimaryHex || theme.primary;
    const secondaryHex = customSecondaryHex || theme.secondary;
    uniformsRef.current.u_color_primary.value.set(primaryHex);
    uniformsRef.current.u_color_secondary.value.set(secondaryHex);
  }, [state, theme, customPrimaryHex, customSecondaryHex]);

  if (reducedMotion) return <div aria-hidden="true" className="voice-orb" />;
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center pointer-events-none select-none"
    />
  );
};
