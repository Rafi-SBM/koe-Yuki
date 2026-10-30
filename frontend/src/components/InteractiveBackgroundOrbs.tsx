"use client";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import React, { useEffect, useRef } from "react";

interface InteractiveBackgroundOrbsProps {
  primaryColor?: string;
  secondaryColor?: string;
}

export function InteractiveBackgroundOrbs({
  primaryColor = "#38bdf8",
  secondaryColor = "#c084fc",
}: InteractiveBackgroundOrbsProps) {
  const reducedMotion = useReducedMotion();
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);

  const mousePos = useRef({ x: 0, y: 0 });
  const smoothMouse = useRef({ x: 0, y: 0 });
  const animFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mousePos.current = {
        x: (e.clientX / innerWidth - 0.5) * 2,
        y: (e.clientY / innerHeight - 0.5) * 2,
      };
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    let time = 0;
    const animate = () => {
      time += 0.012;

      // Smooth lerp mouse tracking
      smoothMouse.current.x += (mousePos.current.x - smoothMouse.current.x) * 0.04;
      smoothMouse.current.y += (mousePos.current.y - smoothMouse.current.y) * 0.04;

      // Continuous harmonic floating motion
      const float1X = Math.sin(time * 0.7) * 55 + Math.cos(time * 0.35) * 25;
      const float1Y = Math.cos(time * 0.6) * 45 + Math.sin(time * 0.25) * 20;

      const float2X = Math.cos(time * 0.5) * 60 + Math.sin(time * 0.4) * 30;
      const float2Y = Math.sin(time * 0.8) * 50 + Math.cos(time * 0.3) * 25;

      // Subtle mouse interactive parallax reaction
      const mouse1X = smoothMouse.current.x * 50;
      const mouse1Y = smoothMouse.current.y * 40;

      const mouse2X = -smoothMouse.current.x * 45;
      const mouse2Y = -smoothMouse.current.y * 35;

      if (orb1Ref.current) {
        orb1Ref.current.style.transform = `translate3d(${float1X + mouse1X}px, ${float1Y + mouse1Y}px, 0) scale(${
          1 + Math.sin(time * 0.8) * 0.08
        })`;
      }

      if (orb2Ref.current) {
        orb2Ref.current.style.transform = `translate3d(${float2X + mouse2X}px, ${float2Y + mouse2Y}px, 0) scale(${
          1 + Math.cos(time * 0.7) * 0.08
        })`;
      }

      animFrameId.current = requestAnimationFrame(animate)
    };

    animFrameId.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Orb 1: Upper-Right slowly drifting blurred sphere */}
      <div
        ref={orb1Ref}
        className="absolute top-1/4 -right-16 sm:right-[-5%] w-[480px] sm:w-[580px] h-[480px] sm:h-[580px] rounded-full blur-[130px] opacity-25 will-change-transform transition-colors duration-1000"
        style={{
          background: `radial-gradient(circle at 40% 40%, ${primaryColor} 0%, ${primaryColor}66 45%, transparent 75%)`,
        }}
      />

      {/* Orb 2: Bottom-Left slowly drifting blurred sphere */}
      <div
        ref={orb2Ref}
        className="absolute -bottom-20 -left-16 sm:left-[-5%] w-[520px] sm:w-[620px] h-[520px] sm:h-[620px] rounded-full blur-[140px] opacity-25 will-change-transform transition-colors duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${secondaryColor} 0%, ${secondaryColor}66 50%, transparent 75%)`,
        }}
      />
    </div>
  );
}
