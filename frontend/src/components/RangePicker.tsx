// The date range control shared by every chart, in full on the page and slimmed down in the sticky bar.
import { MONTH_NAMES, type Calendar, type Range } from "@/lib/months";

/** Quick ranges ending at the latest month, in months; "all" is the whole history. */
export const PRESETS: [number | "all", string][] = [
  [12, "1 year"],
  [60, "5 years"],
  [120, "10 years"],
  [240, "20 years"],
  ["all", "All"],
];

interface Props {
  calendar: Calendar;
  range: Range;
  error: string | null;
  onChoose: (r: Range) => void;
  /** Omitted where the caller shows its own Reset (the sticky bar). */
  onReset?: () => void;
  /** True when nothing differs from how the page opens, so Reset has nothing to do. */
  isDefault?: boolean;
}

/** Preset buttons plus from/to month pickers. One range drives every chart on the page. */
export function RangePicker({ calendar, range, error, onChoose, onReset, isDefault }: Props) {
  const years: number[] = [];
  for (let y = calendar.year(0); y <= calendar.year(calendar.latest); y++) years.push(y);

  const end = (which: "from" | "to", label: string) => {
    const i = range[which];
    const set = (year: number, month: number) => onChoose({ ...range, [which]: calendar.indexOf(year, month) });
    return (
      <span className="pair">
        <span className="muted">{label}</span>
        <select
          aria-label={`${label} month`}
          value={calendar.month(i)}
          onChange={(e) => set(calendar.year(i), Number(e.target.value))}
        >
          {MONTH_NAMES.map((m, k) => (
            <option key={m} value={k}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label={`${label} year`} value={calendar.year(i)} onChange={(e) => set(Number(e.target.value), calendar.month(i))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </span>
    );
  };

  return (
    <>
      <div className="controls">
        {end("from", "From")}
        {end("to", "to")}
        <div className="seg" role="group" aria-label="Quick ranges ending in the latest month">
          {PRESETS.map(([months, label]) => {
            const r = months === "all" ? { from: 0, to: calendar.latest } : calendar.preset(months);
            const pressed = r.from === range.from && r.to === range.to;
            return (
              <button key={label} type="button" aria-pressed={pressed} onClick={() => onChoose(r)}>
                {label}
              </button>
            );
          })}
        </div>
        {onReset && (
          <button type="button" className="btn reset" onClick={onReset} disabled={isDefault} title="Back to the last 5 years">
            Reset
          </button>
        )}
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
