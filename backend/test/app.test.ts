import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp as createRealApp, onError, RATE_LIMIT_PER_MINUTE } from "../src/app.ts";
import type { Dataset } from "../src/data/load.ts";

const tiny: Dataset = {
  start: "2026-01",
  end: "2026-02",
  retrievedOn: "2026-11-09",
  preliminaryMonths: 4,
  series: [{ id: "X", key: "x", name: "X", title: "X", values: [100, 101], mom: [null, 1], yoy: [null, null], volatility: [null, null] }],
};
const createApp = () => createRealApp(tiny);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app", () => {
  it("answers the health check", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("rejects bodies over the size limit without leaking details", async () => {
    const res = await request(createApp())
      .post("/api/health")
      .set("content-type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Bad request" });
  });

  it("returns a generic 400 for malformed JSON", async () => {
    const res = await request(createApp()).post("/api/health").set("content-type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Bad request" });
  });

  it("rate-limits with a JSON 429, and a forged X-Forwarded-For does not get a fresh allowance", async () => {
    const app = createApp();
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      await request(app).get("/api/health").set("x-forwarded-for", `10.0.0.${i % 250}`);
    }
    const res = await request(app).get("/api/health").set("x-forwarded-for", "203.0.113.9");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests" });
  });
});

describe("GET /api/series", () => {
  it("returns the dataset with a cache header", async () => {
    const res = await request(createApp()).get("/api/series");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body).toEqual(tiny);
  });
});

describe("onError", () => {
  it("hides internal error details behind a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/boom", () => {
      throw new Error("secret database password is hunter2");
    });
    app.use(onError);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong" });
    expect(res.text).not.toContain("hunter2");
  });
});
