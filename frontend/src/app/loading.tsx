import { AudioWaveform } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#07090e] text-zinc-300">
      <div className="relative flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border-2 border-sky-500/20 border-t-sky-400 animate-spin" />
        <AudioWaveform className="w-6 h-6 text-sky-400 absolute animate-pulse" />
      </div>
      <p className="mt-4 text-xs font-medium text-zinc-400 tracking-wide animate-pulse">
        Initializing Yuki Voice Hub...
      </p>
    </div>
  );
}
