import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Paths the session cookie does not gate. /api/model-shots is here because it
// carries its own gate — a shared token in X-DDTO-TOKEN, checked in the route
// and failing closed when MODEL_SHOTS_TOKEN is unset — and its caller is the
// Faire extension's service worker, which has no session cookie and no way to
// get one. Everything else still redirects to /login.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/history/cleanup", "/api/model-shots"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET ?? "";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = secret ? await verifySessionToken(token, secret) : false;

  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
