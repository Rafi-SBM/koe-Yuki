import { NextRequest, NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { randomUUID } from "node:crypto";
import { checkSharedRateLimit } from "@/lib/rateLimit";
import { COOKIE_NAME, acquireLease, boundedBody, clientKey, configurationErrors, equalSecret, leaseTicket, maxSessionSeconds, newSession, production, releaseLease, sameOrigin, sessionCookie, sessionId, workerReady } from "@/lib/serverPolicy";
export const runtime = "nodejs";
function reply(message: string, status: number, retry?: number) {
  return NextResponse.json({ error: message, message, isConfigured: false }, { status, headers: { "Cache-Control": "no-store", ...(retry ? { "Retry-After": String(retry) } : {}) } });
}
export async function GET() { return reply("Use POST to start a session.", 405); }
export async function POST(request: NextRequest) {
  let admitted: { id: string; room: string } | undefined;
  try {
    if (!sameOrigin(request)) return reply("Session requests must come from this application.", 403);
    if (configurationErrors().length) return reply("Voice service is not ready. Please try again later.", 503);
    if (new URL(request.url).search) return reply("Room and participant identifiers are server-owned.", 400);
    const limit = await checkSharedRateLimit(`token:${clientKey(request)}`);
    if (!limit.success) return reply("Too many session requests. Please wait before trying again.", 429, limit.resetSeconds);
    let body: Record<string, unknown>;
    try { body = await boundedBody(request); } catch { return reply("Invalid session request.", 400); }
    if (Object.keys(body).some(key => !["consent", "accessCode"].includes(key)) || body.consent !== true) return reply("Please accept the voice processing notice before starting.", 400);
    if (process.env.YUKI_ACCESS_CODE && (typeof body.accessCode !== "string" || !equalSecret(body.accessCode, process.env.YUKI_ACCESS_CODE))) return reply("A valid access code is required.", 403);
    if (!await workerReady()) return reply("The voice worker is unavailable or busy.", 503);
    const owner = sessionId(request) || newSession().id;
    const room = `yuki-${randomUUID()}`, participant = `user-${randomUUID()}`;
    const deadline = Date.now() + maxSessionSeconds() * 1000;
    const expires = deadline + 30000;
    if (!await acquireLease(owner, room, expires)) return reply("The voice service is at capacity or you already have an active call.", 429, 30);
    admitted = { id: owner, room };
    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { identity: participant, name: "Guest", ttl: "2m", metadata: JSON.stringify({ protocol: "yuki.control.v1", deadline, consent: true }) });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: [TrackSource.MICROPHONE] });
    const response = NextResponse.json({ token: await token.toJwt(), serverUrl: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL, roomName: room, participantName: participant, deadline, lease: leaseTicket(owner, room, expires), isConfigured: true }, { headers: { "Cache-Control": "no-store" } });
    // Sign the admitted owner, including on the first request.
    response.cookies.set(COOKIE_NAME, sessionCookie(owner), { httpOnly: true, secure: production(), sameSite: "strict", path: "/", maxAge: 28800 });
    return response;
  } catch {
    if (admitted) await releaseLease(admitted.id, admitted.room).catch(() => {});
    console.error("[Session] Admission failed");
    return reply("Voice service is temporarily unavailable.", 503);
  }
}
