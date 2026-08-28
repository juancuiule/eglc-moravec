import { NextResponse, type NextRequest } from "next/server";
import { Api } from "@/api/Api";
import { SESSION_COOKIE, parseSessionCookie } from "@/storage/session";

/**
 * Validates a persisted session against the backend before "/" or "/login"
 * ever renders — the server-side replacement for the old client-mounted
 * restoreSession() fetch. Pages never validate auth themselves; by the time
 * one of these two routes renders, any session cookie present is already
 * known-good, or has already been cleared.
 *
 * Skips prefetch requests (Next.js prefetches every in-viewport <Link> by
 * default) so hovering/scrolling past a nav link doesn't hit the backend —
 * this runs against a self-hosted, single-instance backend.
 */
export async function proxy(request: NextRequest) {
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next();
  }

  const session = parseSessionCookie(request.cookies.get(SESSION_COOKIE)?.value);  console.log("proxy session", session);
  if (!session) return NextResponse.next();

  const valid = await Api.checkSession(session.token).catch(() => true);
  // A network failure here shouldn't log the player out — fail open and let
  // the client-side session stand; the next real backend call will surface
  // an actual auth failure if the token really is bad.
  if (valid) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/", "/login"],
};
