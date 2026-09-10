import { SESSION_COOKIE, verifySessionToken } from './auth';
export async function adminAllowed(req: Request): Promise<boolean> {
  if (!process.env.AUTH_SECRET) return false;
  if (req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if (!origin || origin !== new URL(req.url).origin) return false;
  }
  const match = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  try { return Boolean(match && await verifySessionToken(decodeURIComponent(match[1]), process.env.AUTH_SECRET)); }
  catch { return false; }
}
