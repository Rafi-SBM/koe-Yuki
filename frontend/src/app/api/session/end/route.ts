import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { boundedBody, releaseLease, sameOrigin, sessionId, verifyLeaseTicket } from "@/lib/serverPolicy";
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const id = sessionId(request);
    const body = await boundedBody(request);
    const room = id && verifyLeaseTicket(body.lease, id);
    if (!room) return NextResponse.json({ error: "Invalid session" }, { status: 403 });
    const service = new RoomServiceClient(process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL!, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { requestTimeout: 5 });
    try { await service.deleteRoom(room); } catch (error) {
      if (!(error instanceof Error) || !/not_found|does not exist|not found/i.test(error.message)) throw error;
    }
    await releaseLease(id!, room);
    return NextResponse.json({ ended: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Session cleanup unavailable; the session will expire automatically." }, { status: 503 }); }
}
