import { NextResponse } from "next/server";
import { configurationErrors, redisConfigured, workerReady } from "@/lib/serverPolicy";
export async function GET() {
  let ready = false;
  try { ready = configurationErrors().length === 0 && redisConfigured() && await workerReady(); } catch { /* Fail closed. */ }
  return NextResponse.json({ status: ready ? "ready" : "unavailable", service: "yuki", timestamp: new Date().toISOString() }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
