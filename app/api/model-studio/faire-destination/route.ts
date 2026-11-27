import { NextResponse } from "next/server";
import { FAIRE_PRODUCT_BASE } from "@/lib/model-studio/send-to";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Which Faire listing a style is on, for Model Studio's "Send to Faire".
 *
 * Read only. Faire Daily already owns the Faire API access and its rate limit, so this asks it
 * (`listing-destination`, the same lookup its Listing Workbench uses) instead of holding Faire tokens here.
 * The session cookie gates this route (proxy.ts). FAIRE_DAILY_TOKEN is Faire Daily's private-link token;
 * without it the page says the lookup is not set up and offers the Faire search instead.
 *
 *   GET ?style=DT78080 → { ok, style, productId, state, url } (productId null when no listing exists)
 */
const STYLE = /^[A-Z0-9][A-Z0-9-]{1,30}$/;

export async function GET(req: Request) {
  const style = String(new URL(req.url).searchParams.get("style") || "").trim().toUpperCase();
  if (!STYLE.test(style)) return NextResponse.json({ ok: false, error: "Type a style code first." }, { status: 400 });
  const token = process.env.FAIRE_DAILY_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, code: "not-configured", error: "The Faire lookup is not set up on this studio yet (FAIRE_DAILY_TOKEN)." }, { status: 503 });
  }
  const base = (process.env.FAIRE_DAILY_URL || "https://faire-daily.vercel.app").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/listing-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "listing-destination", style }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Faire Daily did not answer. Try again in a minute." }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { productId?: string | null; state?: string | null; error?: string };
  if (res.status === 429) return NextResponse.json({ ok: false, error: "Faire is rate limiting lookups right now. Try again in a few minutes." }, { status: 429 });
  if (!res.ok) return NextResponse.json({ ok: false, error: data.error || `Faire Daily answered ${res.status}.` }, { status: 502 });
  const productId = typeof data.productId === "string" && /^p_\w+$/.test(data.productId) ? data.productId : null;
  return NextResponse.json({ ok: true, style, productId, state: productId ? data.state || null : null, url: productId ? FAIRE_PRODUCT_BASE + productId : null });
}
