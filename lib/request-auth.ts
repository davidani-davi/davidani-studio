import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

/**
 * The /api/user-models routes are public in proxy.ts so the Listing Team portal and the recast upload (server side,
 * X-DDTO-TOKEN) can reach them; the studio UI uses its session cookie. Each route checks one of the two itself.
 */
export async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MODEL_SHOTS_TOKEN || process.env.APP_PASSWORD;
  const got = req.headers.get("x-ddto-token") || "";
  if (expected && got.length === expected.length && got === expected) return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1]), secret) : false;
}

export const unauthorized = () => NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
