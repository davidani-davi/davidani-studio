import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Which fal account is this deployment spending from? (David, 2026-09-08:
 * "what fal account is it?" — the shell key was topped up and the studio's
 * helpers still came back Forbidden.) Reports the key's public id prefix and
 * the account balance from fal's billing endpoint; never the secret half.
 * Token-gated exactly like /api/model-shots.
 */
async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MODEL_SHOTS_TOKEN || process.env.APP_PASSWORD;
  const got = req.headers.get("x-ddto-token") || "";
  if (expected && got.length === expected.length && got === expected) return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1]), secret) : false;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const key = process.env.FAL_KEY || "";
  if (!key) return NextResponse.json({ ok: false, error: "FAL_KEY is not set" }, { status: 500 });
  const keyIdPrefix = key.split(":")[0].slice(0, 8);
  let balance: number | null = null;
  let error = "";
  try {
    const r = await fetch("https://rest.alpha.fal.ai/billing/user_balance", { headers: { Authorization: `Key ${key}` } });
    const text = await r.text();
    if (r.ok) balance = Number(text);
    else error = `fal ${r.status}: ${text.slice(0, 200)}`;
  } catch (e: any) {
    error = String(e?.message || e);
  }
  return NextResponse.json({ ok: !error, keyIdPrefix, balance, error: error || undefined, openAiKeySet: Boolean(process.env.OPENAI_API_KEY) });
}
