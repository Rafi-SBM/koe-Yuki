"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe error diagnostics in development or report to telemetry
    console.error("[Yuki Error Boundary Caught]:", error);
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen w-full bg-[#07090e] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-xl mb-4">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Something went wrong</h1>
      <p className="text-xs text-zinc-400 max-w-md mt-2 leading-relaxed">
        An unexpected error occurred in the voice session. Your local preferences are preserved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Recover Session
        </button>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
        >
          Reload Page
        </button>
      </div>
    </main>
  );
}
