"use client";
// The break-even dot chart in each material's "More": one dot per similar period, against your carrying cost.

import { useState } from "react";
import { monthLabel, type Material } from "@/lib/risk";
import { useWidth } from "@/lib/useWidth";

const R = 5;
const ROW = 2 * R + 2;
const PAD = { left: 8, right: 8, top: 26, bottom: 24 };
// Rates beyond these are drawn at the edge so a single extreme period can't squash the rest.
const FLOOR = -0.02;
const CEIL = 0.04;
const STEPS = [0.001, 0.0025, 0.005, 0.01, 0.02];

const label = (r: number) => `${(r * 100).toFixed(2).replace("-", "−")}%`;
const tickLabel = (r: number) => `${Number((r * 100).toFixed(2)).toString().replace("-", "−")}%`;

interface Props {
  material: Material;
  name: string;
  rates: number[];
  similar: string[];
  rate: number;
  /** The backend's count of periods where buying early came out ahead. */
  ahead: number;
}

/** One dot per similar period at its break-even carrying cost, with a line at the user's rate. */
export function BreakEvenStrip({ material, name, rates, similar, rate, ahead }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);

  const lo = Math.max(FLOOR, Math.min(0, rate, ...rates));
  // The user's own rate always fits on the scale, however high.
  const hi = Math.max(rate, Math.min(CEIL, Math.max(...rates)));
  const span = hi - lo || 0.01;
  const d0 = lo - span * 0.04;
  const d1 = hi + span * 0.04;
  const plotW = Math.max(width - PAD.left - PAD.right, 100);
  const x = (r: number) => PAD.left + ((Math.min(Math.max(r, d0), d1) - d0) / (d1 - d0)) * plotW;

  // Stack dots that would overlap, lowest free row first.
  const rows: number[][] = [];
  const dots = rates
    .map((r, i) => ({ i, r, cx: x(r) }))
    .sort((a, b) => a.cx - b.cx)
    .map((d) => {
      let row = rows.findIndex((xs) => xs.every((cx) => Math.abs(cx - d.cx) >= ROW));
      if (row === -1) row = rows.push([]) - 1;
      rows[row]!.push(d.cx);
      return { ...d, row };
    });
  const plotH = Math.max(rows.length, 1) * ROW;
  const height = PAD.top + plotH + PAD.bottom;
  const base = PAD.top + plotH;

  const step = STEPS.find((s) => (d1 - d0) / s <= 6) ?? 0.05;
  const ticks: number[] = [];
  for (let t = Math.ceil(d0 / step) * step; t <= d1 + 1e-12; t += step) ticks.push(Number(t.toFixed(6)));

  // Same rule as the backend: rates arrive rounded to 9 places, so round the user's rate too.
  const r0 = Math.round(rate * 1e9) / 1e9;
  const beyond = rates.filter((r) => r < d0 || r > d1).length;
  const yourX = x(rate);
  const shown = hover === null ? null : dots.find((d) => d.i === hover);

  return (
    <div className="strip" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${name}: break-even carrying cost in each of ${rates.length} similar past periods. Buying early came out ahead in ${ahead}, those above your ${label(rate)} a month.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top - 4} y2={base} className={t === 0 ? "strip-zero" : "strip-grid"} />
            <text x={x(t)} y={base + 16} textAnchor="middle" className="strip-tick">
              {tickLabel(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={PAD.left + plotW} y1={base} y2={base} className="strip-axis" />
        <line x1={yourX} x2={yourX} y1={PAD.top - 10} y2={base} className="strip-you" />
        <text
          x={yourX}
          y={PAD.top - 14}
          textAnchor={yourX < 70 ? "start" : yourX > width - 70 ? "end" : "middle"}
          className="strip-you-label"
        >
          Your {label(rate)}
        </text>
        {dots.map((d) => (
          <circle
            key={d.i}
            cx={d.cx}
            cy={base - R - 1 - d.row * ROW}
            r={hover === d.i ? R + 1.5 : R}
            className={`strip-dot dot-${material}${r0 < d.r ? "" : " strip-open"}`}
            onMouseEnter={() => setHover(d.i)}
          />
        ))}
      </svg>
      {shown && (
        <div className="tip strip-tip" style={{ left: Math.min(Math.max(shown.cx - 110, 0), Math.max(width - 220, 0)), top: height - 4 }}>
          <div className="tip-h">Similar period from {monthLabel(similar[shown.i] ?? "")}</div>
          Break-even {label(shown.r)} a month. Buying early {r0 < shown.r ? "came out ahead" : "didn't come out ahead"} at your rate.
        </div>
      )}
      <p className="strip-key" aria-hidden="true">
        <Key material={material} open={false} /> came out ahead at your rate
        <Key material={material} open /> didn&apos;t
      </p>
      {beyond > 0 && (
        <p className="strip-key">
          {beyond === 1 ? "1 period is" : `${beyond} periods are`} beyond the scale and drawn at its edge.
        </p>
      )}
    </div>
  );
}

const Key = ({ material, open }: { material: Material; open: boolean }) => (
  <svg width={14} height={14} className="strip-k">
    <circle cx={7} cy={7} r={R} className={`strip-dot dot-${material}${open ? " strip-open" : ""}`} />
  </svg>
);
