import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hashVisitorToken,
  newVisitorToken,
  recordHitFromRequest,
} from "@/lib/server/traffic";
import { readCookie, shouldTrackRequest, VISITOR_COOKIE } from "@/lib/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  path: z.string().min(1).max(180),
});

const VISITOR_TOKEN_RE = /^[0-9a-f]{32}$/i;
const MAX_BODY_BYTES = 512;

function visitorFromRequest(request: Request): { token: string; fresh: boolean } {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  if (existing && VISITOR_TOKEN_RE.test(existing)) {
    return { token: existing, fresh: false };
  }
  return { token: newVisitorToken(), fresh: true };
}

function emptyHit(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/traffic/hit — first-party pageview beacon.
 * Writes O(1) daily rollups only. Always 204 so the client cannot probe.
 */
export async function POST(request: Request) {
  const visitor = visitorFromRequest(request);
  let tracked = false;
  try {
    const rawText = await request.text();
    if (rawText.length > 0 && rawText.length <= MAX_BODY_BYTES) {
      let raw: unknown;
      try {
        raw = JSON.parse(rawText);
      } catch {
        raw = null;
      }
      const parsed = BodySchema.safeParse(raw);
      if (parsed.success) {
        tracked = shouldTrackRequest(request);
        recordHitFromRequest(
          request,
          parsed.data.path,
          hashVisitorToken(visitor.token),
        );
      }
    }
  } catch {
    // Beacon is fire-and-forget.
  }

  const res = emptyHit();
  if (visitor.fresh && tracked) {
    res.cookies.set({
      name: VISITOR_COOKIE,
      value: visitor.token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
