// The shared chart frame: gridlines, axis labels, preliminary shading, and the lines or bars from lib/chart.ts.
import type { MouseEvent, ReactNode, Ref } from "react";
import type { ChartGeometry } from "@/lib/chart";

interface Props {
  geometry: ChartGeometry;
  /** Series keys, in the same order as geometry.paths (bars use the first). */
  keys: string[];
  label: string;
  tickLabel: (v: number) => string;
  className?: string;
  /** Called with the clicked point's index (0 = first point in view). */
  onPick?: (i: number) => void;
  /** Horizontal position (%) of the selected month's marker, if it is in view. */
  markerPos?: number | null;
  ref?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

/** Axes, gridlines, preliminary shading and marks. Lines are one <path> per series. */
export function Plot({ geometry: g, keys, label, tickLabel, className, onPick, markerPos, ref, children }: Props) {
  const pick = onPick
    ? (e: MouseEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick(g.indexAt((e.clientX - r.left) / r.width));
      }
    : undefined;
  return (
    <div ref={ref} role="img" aria-label={label} className={`plot${onPick ? " pickable" : ""} ${className ?? ""}`} onClick={pick}>
      {g.prelimPos !== null && <div className="pre" style={{ left: `${g.prelimPos}%` }} />}
      {g.yTicks.map((t) => (
        <div key={`y${t.value}`} aria-hidden="true">
          <div className={`gl${t.value === 0 ? " zero" : ""}`} style={{ top: `${t.pos}%` }} />
          <div className="yl" style={{ top: `${t.pos}%` }}>
            {tickLabel(t.value)}
          </div>
        </div>
      ))}
      {g.xTicks.map((t) => (
        <div key={`x${t.pos}`} className="xl" style={{ left: `${t.pos}%` }} aria-hidden="true">
          {t.label}
        </div>
      ))}
      {g.bars.map((b, i) => (
        <div
          key={i}
          className={`bar fill-${keys[0]}`}
          style={{ left: `${b.left}%`, width: `${b.width}%`, top: `${b.top}%`, height: `${b.height}%` }}
          aria-hidden="true"
        />
      ))}
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        {g.paths.map((d, i) => (
          <path key={keys[i]} d={d} className={`line stroke-${keys[i]}`} />
        ))}
      </svg>
      {markerPos != null && <div className="marker" style={{ left: `${markerPos}%` }} aria-hidden="true" />}
      {children}
    </div>
  );
}
