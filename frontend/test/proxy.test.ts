import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildCsp, proxy } from "@/proxy";

describe("buildCsp", () => {
  it("allows only nonce'd scripts in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("requires the nonce for <style> tags in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("style-src 'self' 'nonce-abc'");
    expect(csp).not.toMatch(/style-src [^;]*unsafe-inline/);
  });

  it("relaxes only eval and inline <style> in development", () => {
    const csp = buildCsp("abc", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("blocks framing, plugins and foreign connections", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
  });
});

describe("proxy", () => {
  it("sets a CSP with a fresh nonce on every request", () => {
    const a = proxy(new NextRequest("http://localhost/"));
    const b = proxy(new NextRequest("http://localhost/"));
    const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];
    const na = nonceOf(a.headers.get("Content-Security-Policy"));
    const nb = nonceOf(b.headers.get("Content-Security-Policy"));
    expect(na).toBeTruthy();
    expect(nb).toBeTruthy();
    expect(na).not.toBe(nb);
  });
});
