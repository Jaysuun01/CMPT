// Entry point: loads and checks the data once, then serves the API on loopback (port 4000 by default).
import { join } from "node:path";
import { createApp } from "./app.ts";
import { loadDataset } from "./data/load.ts";

// Loopback only: the API is reached through the frontend proxy, never directly from the network.
const HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 4000);

// Fail fast at startup if the data is malformed, rather than serving a broken page later.
const dataset = loadDataset(join(import.meta.dirname, "..", "data"));

createApp(dataset).listen(port, HOST, () => {
  if (process.env.GEMINI_MOCK === "1") console.log("GEMINI_MOCK=1: the AI routes return fixed test fixtures, not real results.");
  console.log(`API listening on http://${HOST}:${port} (${dataset.series.length} series, ${dataset.start} to ${dataset.end})`);
});
