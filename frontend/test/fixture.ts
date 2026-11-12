import type { Dataset } from "@/lib/dataset";

/** A small, predictable dataset: 72 months from Jan 2020 to Dec 2025, the last 4 preliminary. */
export function makeDataset(): Dataset {
  const n = 72;
  const make = (f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));
  const series = [
    { id: "WPU101", key: "steel", name: "Iron and steel", values: make((i) => 100 + i) },
    { id: "WPU08", key: "lumber", name: "Lumber and wood", values: make((i) => 200 - i) },
    { id: "WPU133", key: "concrete", name: "Concrete products", values: make((i) => 50 + i / 2) },
  ];
  return {
    start: "2020-01",
    end: "2025-12",
    retrievedOn: "2026-11-09",
    preliminaryMonths: 4,
    series: series.map((s) => ({
      ...s,
      title: `Producer Price Index by Commodity: ${s.name}`,
      mom: s.values.map((v, i) => (i ? (v / s.values[i - 1]! - 1) * 100 : null)),
      yoy: s.values.map((v, i) => (i >= 12 ? (v / s.values[i - 12]! - 1) * 100 : null)),
      volatility: s.values.map((_, i) => (i >= 12 ? 0.5 + (i % 7) / 10 : null)),
    })),
  };
}
