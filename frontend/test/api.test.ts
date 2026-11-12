import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataset } from "@/lib/api";
import { makeDataset } from "./fixture";

// getDataset runs on the server; the backend's reply is untrusted and checked with DatasetSchema (CLAUDE.md §5).
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getDataset", () => {
  it("returns the dataset when the backend sends a valid one", async () => {
    const ds = makeDataset();
    const fetch = reply(ds);
    vi.stubGlobal("fetch", fetch);
    expect(await getDataset()).toEqual(ds);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:4000/api/series", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("returns null on an error status", async () => {
    vi.stubGlobal("fetch", reply({ error: "Something went wrong" }, 500));
    expect(await getDataset()).toBeNull();
  });

  it("returns null, and logs only the first issues, when the reply has an unexpected shape", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply({ ...makeDataset(), extra: "field" }));
    expect(await getDataset()).toBeNull();
    expect(log).toHaveBeenCalledWith("Unexpected /api/series response", expect.any(Array));
  });

  it("returns null when the backend can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await getDataset()).toBeNull();
  });
});
