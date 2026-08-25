import type { GarmentCategory } from "./canvas-registry";

/**
 * Look up a style's garment category in the Davi & Dani ERP.
 *
 * WHY
 * ---
 * The canvas is chosen from the garment's category, and inferring that from a
 * photo is unreliable on styled on-model shots. DETS60234 is a two-piece
 * activewear set; across three live runs the vision analyzer called it a
 * "tennis dress" every time, so it rendered as one garment instead of two. The
 * ERP records `category: 'SET'` for it, flatly and for free.
 *
 * SCOPE — deliberately narrow
 * ---------------------------
 * Only `category` is read. The free-text `descr` fields are NOT used and should
 * not be: DSP50066's descr says "TAN DENIM" when the style's only colorway on
 * record is WASHED DENIM and the garment photographs near-neutral grey. The
 * same field reads "ELASITC WIT". Feeding that into a prompt would inject
 * confident wrong detail, which is worse than a vision guess because it reads
 * authoritative.
 *
 * BEST EFFORT, ALWAYS
 * -------------------
 * Every failure path returns null so the caller falls back to vision
 * inference: no credentials configured, login rejected, ERP down, style not
 * found, unrecognised category string. Image Studio must keep working with no
 * ERP at all — this only ever upgrades a guess into a fact.
 *
 * CREDENTIALS
 * -----------
 * ERP_USER_ID / ERP_PASSWORD, read from the environment and never logged. Same
 * pair the ship-scanner's unattended jobs use (scripts/erp_client.py). Without
 * them this module is inert.
 */

const BASE = "https://system.davidani.com";
const LOOKUP_TIMEOUT_MS = 6000;
const CATEGORY_TTL_MS = 60 * 60 * 1000; // categories are near-static
const SESSION_TTL_MS = 20 * 60 * 1000;

/**
 * ERP category strings, verified against 205 sampled live styles. `BOTTOM`
 * covers both skirts and trousers, so it cannot resolve on its own — see
 * resolveErpCategory().
 */
const ERP_TO_CATEGORY: Record<string, GarmentCategory | "ambiguous-bottom"> = {
  "TOP": "top",
  "JACKETS / OUTWEAR": "outerwear",
  "DRESS": "dress",
  // No jumpsuit canvas exists; a one-piece jumpsuit frames closest to the
  // dress canvas (tall and narrow) and is a one-piece like a dress.
  "JUMPSUIT": "dress",
  "SET": "set",
  "BOTTOM": "ambiguous-bottom",
};

let cookie: { value: string; at: number } | null = null;
const categoryCache = new Map<string, { value: string | null; at: number }>();

function fresh(at: number, ttl: number) {
  return Date.now() - at < ttl;
}

/** Log in and return the session cookie header. Never logs credentials. */
async function login(): Promise<string | null> {
  const userId = process.env.ERP_USER_ID;
  const password = process.env.ERP_PASSWORD;
  if (!userId || !password) return null;

  if (cookie && fresh(cookie.at, SESSION_TTL_MS)) return cookie.value;

  const body = new URLSearchParams({
    userId,
    userPass: password,
    idStore: "1",
    redirect: "main.asp",
  });
  const res = await fetch(`${BASE}/xt.login.asp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      Referer: `${BASE}/login.asp`,
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });

  const jar = res.headers
    .getSetCookie?.()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!jar) return null;

  // The ERP sets ASPSESSIONID even on a FAILED login, so probe an authed page
  // rather than trusting the cookie's existence (same check as erp_client.py).
  const probe = await fetch(`${BASE}/main.asp`, {
    headers: { Cookie: jar, "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  const text = await probe.text();
  if (probe.url.includes("/login.asp") || text.includes("userPass")) {
    console.warn("[erp-category] login did not authenticate — check ERP_USER_ID / ERP_PASSWORD");
    return null;
  }

  cookie = { value: jar, at: Date.now() };
  return jar;
}

/** Raw ERP `category` string for a style, or null. Never throws. */
export async function fetchErpCategory(
  style: string | null | undefined
): Promise<string | null> {
  const key = String(style || "").trim().toUpperCase();
  if (!key) return null;

  const hit = categoryCache.get(key);
  if (hit && fresh(hit.at, CATEGORY_TTL_MS)) return hit.value;

  try {
    const jar = await login();
    if (!jar) return null;

    const res = await fetch(
      `${BASE}/data/Style.Center.StyleForm.Load.asp?idStyle=${encodeURIComponent(key)}`,
      {
        headers: { Cookie: jar, "User-Agent": "Mozilla/5.0", Referer: `${BASE}/main.asp` },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      }
    );
    if (!res.ok) return null;
    // The endpoint returns JS-object syntax (key: 'value'), not JSON.
    const m = /\bcategory\s*:\s*'([^']*)'/.exec(await res.text());
    const value = m ? m[1].trim() : null;
    categoryCache.set(key, { value, at: Date.now() });
    return value;
  } catch (err: any) {
    // Timeouts, DNS, ERP hiccups — all non-fatal, we just fall back to vision.
    console.warn("[erp-category] lookup failed:", err?.name || err);
    return null;
  }
}

/**
 * Map a raw ERP category string. Returns "ambiguous-bottom" for BOTTOM (which
 * covers both skirts and trousers), or null when unset/unrecognised.
 *
 * Pure — no network — so the caller can resolve the category BEFORE running
 * vision. That ordering matters: a style the ERP calls SET has to be sent
 * through the two-piece extractor, and that decision has to be made before
 * extraction, not after.
 */
export function mapErpCategory(
  raw: string | null | undefined
): GarmentCategory | "ambiguous-bottom" | null {
  if (!raw) return null;
  const mapped = ERP_TO_CATEGORY[raw.trim().toUpperCase()];
  if (!mapped) {
    console.warn(`[erp-category] unmapped ERP category "${raw}" — falling back to vision`);
    return null;
  }
  return mapped;
}

export interface ErpCategoryResult {
  /** Mapped category, or null when the ERP could not settle it. */
  category: GarmentCategory | null;
  /** Raw ERP string, for logging. */
  raw: string | null;
  /**
   * True when the ERP said BOTTOM — real, but not specific enough to pick
   * between the pants and skirt canvases on its own.
   */
  ambiguousBottom: boolean;
}

/**
 * Resolve a style to a canvas category using the ERP.
 *
 * `visionCategory` is the analyzer's own read, used only to split BOTTOM into
 * pants vs skirt. The ERP still owns the decision everywhere else — that split
 * is the one place it is genuinely under-specified.
 */
export async function resolveErpCategory(
  style: string | null | undefined,
  visionCategory?: GarmentCategory
): Promise<ErpCategoryResult> {
  const raw = style ? await fetchErpCategory(style) : null;
  const mapped = mapErpCategory(raw);
  if (!mapped) return { category: null, raw, ambiguousBottom: false };

  if (mapped === "ambiguous-bottom") {
    // Trust vision only when it also says a bottom; otherwise pants, which is
    // the larger BOTTOM population and routes to the sweep either way today.
    const category: GarmentCategory =
      visionCategory === "skirt" || visionCategory === "pants" ? visionCategory : "pants";
    return { category, raw, ambiguousBottom: true };
  }

  return { category: mapped, raw, ambiguousBottom: false };
}

/** Test seam: clear memoised session + category cache. */
export function __resetErpCache() {
  cookie = null;
  categoryCache.clear();
}
