import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen w-full bg-[#07090e] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center shadow-xl mb-4 text-sky-400">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">404 — Page Not Found</h1>
      <p className="text-xs text-zinc-400 max-w-sm mt-2 leading-relaxed">
        The destination you are looking for does not exist or has moved. Return to the Voice Hub to converse with Yuki.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-medium transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Yuki Voice Hub
      </Link>
    </main>
  );
}
