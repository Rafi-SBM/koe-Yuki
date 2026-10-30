"use client";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import React, { useEffect, useState, useRef } from "react";

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  rotation: number;
  rotSpeed: number;
  color: string;
}

interface CustomCursorProps {
  primaryColor?: string;
  secondaryColor?: string;
}

export function CustomCursor({
  primaryColor = "#38bdf8",
  secondaryColor = "#c084fc",
}: CustomCursorProps) {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const cursorContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mousePos = useRef({ x: -100, y: -100 });
  const prevPos = useRef({ x: -100, y: -100 });
  const smoothPos = useRef({ x: -100, y: -100 });
  const sparksRef = useRef<SparkParticle[]>([]);
  const animFrameId = useRef<number | null>(null);
  const lastSpawnTime = useRef<number>(0);

  useEffect(() => {
    // Only enable on desktop devices with fine pointer (no touch)
    if (typeof window === "undefined") return;
    if (reducedMotion) return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;

    setMounted(true);

    const canvas = canvasRef.current;
    const updateCanvasDimensions = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateCanvasDimensions();
    window.addEventListener("resize", updateCanvasDimensions, { passive: true });

    const sparkColors = [
      primaryColor,
      secondaryColor,
      "#38bdf8", // Sky Blue
      "#c084fc", // Lavender
      "#e879f9", // Magenta
      "#ffffff", // Diamond Spark
    ];

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      if (!isVisible) setIsVisible(true);

      const lastX = prevPos.current.x === -100 ? x : prevPos.current.x;
      const lastY = prevPos.current.y === -100 ? y : prevPos.current.y;
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);

      mousePos.current = { x, y };
      prevPos.current = { x, y };

      const now = performance.now();

      // Throttle spawn rate for extreme lightness and fluid 120fps
      if (dist > 3 && now - lastSpawnTime.current > 16) {
        lastSpawnTime.current = now;

        // Emit 1 or 2 lightweight sparks depending on speed
        const count = dist > 25 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          if (sparksRef.current.length >= 16) break; // Hard cap to prevent lag

          const angle = Math.random() * Math.PI * 2;
          const burst = 0.5 + Math.random() * 1.8;
          const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];

          sparksRef.current.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            vx: -dx * 0.08 + Math.cos(angle) * burst,
            vy: -dy * 0.08 + Math.sin(angle) * burst - 0.2, // Gentle upward float
            size: 3.5 + Math.random() * 3.5,
            alpha: 1.0,
            decay: 0.04 + Math.random() * 0.03, // Snappy life ~350ms
            rotation: Math.random() * Math.PI,
            rotSpeed: (Math.random() - 0.5) * 0.18,
            color,
          });
        }
      }

      // Check for interactive targets
      const target = e.target as HTMLElement | null;
      const isInteractive = Boolean(
        target?.closest('a, button, input, textarea, select, [role="button"], .cursor-pointer')
      );
      setIsHovered(isInteractive);
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    // Ultra-optimized 4-point star path generator
    const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      ctx.closePath();
      ctx.fill();
    };

    let hadSparks = false;

    // 60-120fps Animation Loop
    const animate = () => {
      // 1. Concentric Cursor Lerp
      smoothPos.current.x += (mousePos.current.x - smoothPos.current.x) * 0.28;
      smoothPos.current.y += (mousePos.current.y - smoothPos.current.y) * 0.28;

      if (cursorContainerRef.current) {
        cursorContainerRef.current.style.transform = `translate3d(${smoothPos.current.x}px, ${smoothPos.current.y}px, 0) translate(-50%, -50%)`;
      }

      // 2. Render Sparks Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d", { alpha: true });
        if (ctx) {
          if (sparksRef.current.length > 0) {
            hadSparks = true;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = sparksRef.current.length - 1; i >= 0; i--) {
              const p = sparksRef.current[i];
              p.x += p.vx;
              p.y += p.vy;
              p.vx *= 0.93; // Air friction
              p.vy *= 0.93;
              p.alpha -= p.decay;
              p.rotation += p.rotSpeed;

              if (p.alpha <= 0) {
                sparksRef.current.splice(i, 1);
                continue;
              }

              const currentSize = p.size * p.alpha;
              if (currentSize <= 0.5) continue;

              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.rotate(p.rotation);
              ctx.globalAlpha = Math.min(1, Math.max(0, p.alpha));
              ctx.fillStyle = p.color;

              drawStar(ctx, 0, 0, currentSize);
              ctx.restore();
            }
          } else if (hadSparks) {
            // Clear once when all sparks expire, then pause canvas work
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hadSparks = false;
          }
        }
      }

      animFrameId.current = requestAnimationFrame(animate);
    };

    animFrameId.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", updateCanvasDimensions);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [isVisible, primaryColor, secondaryColor, reducedMotion]);

  if (!mounted || reducedMotion) return null;

  return (
    <>
      {/* Zero-overhead particle spark canvas layer */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[99998] w-full h-full"
      />

      {/* Concentric Custom Cursor Ring & Dot */}
      <div
        ref={cursorContainerRef}
        className={`fixed top-0 left-0 pointer-events-none z-[99999] will-change-transform transition-opacity duration-200 flex items-center justify-center ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: "48px", height: "48px" }}
      >
        {/* Concentric Outer Ring */}
        <div
          className={`absolute inset-0 m-auto rounded-full border transition-all duration-200 ease-out flex items-center justify-center ${
            isHovered
              ? "w-11 h-11 border-sky-400/90 bg-sky-500/20 shadow-[0_0_20px_rgba(56,189,248,0.5)] scale-100"
              : "w-7 h-7 border-sky-500/60 bg-sky-500/10 shadow-[0_0_10px_rgba(56,189,248,0.3)] scale-100"
          }`}
          style={
            isHovered
              ? {
                  borderColor: `${primaryColor}e6`,
                  backgroundColor: `${primaryColor}33`,
                  boxShadow: `0 0 20px ${primaryColor}80`,
                }
              : {
                  borderColor: `${primaryColor}99`,
                  backgroundColor: `${primaryColor}1a`,
                  boxShadow: `0 0 10px ${primaryColor}4d`,
                }
          }
        />

        {/* Concentric Center Glow Dot */}
        <div
          className={`absolute rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] transition-all duration-150 ${
            isHovered ? "w-2 h-2 scale-125" : "w-1.5 h-1.5 scale-100"
          }`}
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            boxShadow: `0 0 8px ${secondaryColor}e6`,
          }}
        />
      </div>
    </>
  );
}
