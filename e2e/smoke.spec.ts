// Smoke tests on the production build: the page loads cleanly under the CSP, the security headers are sent, the API is proxied.
import { expect, test, type Page } from "@playwright/test";

/** Records console errors and CSP violations on a page, so a test can assert there were none. */
function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // The browser logs the 404 status of the page itself; that one is expected on the 404 test.
    const isDocument404 = msg.text().startsWith("Failed to load resource") && msg.location().url === page.url();
    if (!isDocument404) problems.push(msg.text());
  });
  page.on("pageerror", (err) => problems.push(err.message));
  return problems;
}

test("page loads from a production build with no console or CSP errors", async ({ page }) => {
  const problems = collectProblems(page);

  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Compare two months" })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(13);
  expect(problems).toEqual([]);
});

test("sends a nonce CSP and the other security headers", async ({ page }) => {
  const res = await page.goto("/");
  const h = res?.headers() ?? {};
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  expect(h["content-security-policy"]).toMatch(/style-src 'self' 'nonce-[^']+'/);
  expect(h["x-powered-by"]).toBeUndefined();
});

test("the 404 page also renders under the CSP without violations", async ({ page }) => {
  const problems = collectProblems(page);
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("the API is reachable through the frontend origin", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
