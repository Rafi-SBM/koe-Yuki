import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { boundedBody, clientKey, production, redisConfigured, sameOrigin, workerReady } from "@/lib/serverPolicy";
const headers = { "Cache-Control": "no-store" };
function admission(request: NextRequest) {
  if (production()) return NextResponse.json({ message: "Operator diagnostics are available only in local development." }, { status: 404, headers });
  const rate = checkRateLimit(`harness:${clientKey(request)}`, 30);
  if (!rate.success) return NextResponse.json({ message: "Diagnostics are rate limited. Please retry later." }, { status: 429, headers: { ...headers, "Retry-After": String(rate.resetSeconds) } });
}
export async function GET(request: NextRequest) {
  try {
    const denied = admission(request); if (denied) return denied;
    const ready = redisConfigured() && await workerReady();
    return NextResponse.json({ status: "configuration_only", timestamp: new Date().toISOString(), primaryEngine: "worker", observability: { langfuse: { configured: false, host: "worker-managed", isSelfHosted: false, license: "See worker configuration" } }, infrastructure: { livekitReady: ready, groqKeysCount: 0, model: "openai/gpt-oss-120b", ttsModel: "Kokoro ONNX v1.0", sttModel: "Groq Whisper Large v3" } }, { headers });
  } catch { return NextResponse.json({ message: "Diagnostics are unavailable." }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  try {
    const denied = admission(request); if (denied) return denied;
    if (!sameOrigin(request)) return NextResponse.json({ message: "Invalid request origin." }, { status: 403, headers });
    await boundedBody(request);
    return NextResponse.json({ status: "not_run", message: "Run these commands in the worker environment for measured results. This dashboard does not execute them.", commands: ["./agent/venv/bin/python agent/eval_harness.py", "./agent/venv/bin/python agent/tests/test_livekit_e2e.py", "./agent/venv/bin/python agent/tests/test_concurrency.py --users 2"], subsystems: { language_routing: { status: "not_measured", score: "not measured", testedLanguages: [], accuracy: null }, kokoro_tts: { status: "not_measured", model: "Kokoro ONNX v1.0", sampleRate: 24000 }, groq_llm: { status: "not_measured", model: "openai/gpt-oss-120b" }, key_pool: { status: "not_measured" } } }, { headers });
  } catch { return NextResponse.json({ message: "Invalid diagnostics request." }, { status: 400, headers }); }
}
