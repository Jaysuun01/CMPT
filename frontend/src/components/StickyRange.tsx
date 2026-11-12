// A slim range bar that pins to the top once the full range controls scroll away.
import { useEffect, useRef, useState } from "react";
import type { Calendar, Range } from "@/lib/months";
import { PRESETS, RangePicker } from "./RangePicker";

interface Props {
  calendar: Calendar;
  range: Range;
  error: string | null;
  onChoose: (r: Range) => void;
  onReset: () => void;
  isDefault: boolean;
}

/** Slim bar pinned to the top once the full range controls scroll out of view. */
export function StickyRange({ calendar, range, error, onChoose, onReset, isDefault }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Close on Escape (returning focus to the button) or on a click outside.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("select")?.focus();
    const close = () => {
      setOpen(false);
      button.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="sticky" role="region" aria-label="Date range">
      <div className="wrap sticky-inner">
        <span className="brand">Material prices</span>
        <div className="sticky-controls">
          <button
            ref={button}
            type="button"
            className="range-btn"
            aria-expanded={open}
            aria-controls="sticky-panel"
            onClick={() => setOpen((o) => !o)}
          >
            {calendar.label(range.from)} – {calendar.label(range.to)}
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className="seg sticky-presets" role="group" aria-label="Quick ranges ending in the latest month">
            {PRESETS.map(([months, label]) => {
              const r = months === "all" ? { from: 0, to: calendar.latest } : calendar.preset(months);
              return (
                <button key={label} type="button" aria-pressed={r.from === range.from && r.to === range.to} onClick={() => onChoose(r)}>
                  {label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn reset" onClick={onReset} disabled={isDefault} title="Back to the last 5 years">
            Reset
          </button>
        </div>
        {open && (
          <div ref={panel} id="sticky-panel" className="sticky-panel" role="dialog" aria-label="Choose months">
            <RangePicker calendar={calendar} range={range} error={error} onChoose={onChoose} />
          </div>
        )}
      </div>
    </div>
  );
}
