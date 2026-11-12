// Server-side fetch of the price data for the price page. Never runs in the browser (server-only).
import "server-only";
import { DatasetSchema, type Dataset } from "./dataset";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

/** The cleaned series and stats from the backend, or null if it is down or sends something unexpected. */
export async function getDataset(): Promise<Dataset | null> {
  try {
    const res = await fetch(`${backendUrl}/api/series`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const parsed = DatasetSchema.safeParse(await res.json());
    if (!parsed.success) console.error("Unexpected /api/series response", parsed.error.issues.slice(0, 3));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
