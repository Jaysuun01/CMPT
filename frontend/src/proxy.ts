// Next.js proxy (formerly middleware): adds the per-request nonce Content-Security-Policy (CLAUDE.md §5).
import { NextResponse, type NextRequest } from "next/server";

// Per-request nonce CSP (Next.js CSP guide). Next attaches the nonce to its own scripts.
// Production: inline style *attributes* are allowed because the charts position marks with them.
// Development: React's dev tooling needs eval and injects inline <style> tags, as the guide notes.
/** The Content-Security-Policy for one request. Exported so its rules are unit-tested (test/proxy.test.ts). */
export function buildCsp(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Runs before every page: makes a fresh nonce and sets the CSP on the request (for Next to read) and the response. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Next reads the nonce from the request's CSP header while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/** Every route except static assets and prefetches, which carry no inline scripts. */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
