// Month positions are integer indexes into the dataset arrays (0 = dataset.start).
// No Date objects or Intl, so server and client render identical labels.

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A month range as positions in the dataset (0 = dataset start), inclusive. */
export interface Range {
  from: number;
  to: number;
}

/** Converts between month positions, "YYYY-MM" keys and labels, and reads/writes ranges from URL parameters. */
export class Calendar {
  private readonly base: number;

  constructor(
    start: string,
    readonly length: number,
  ) {
    const m = KEY.exec(start);
    if (!m) throw new Error(`Invalid start month "${start}"`);
    this.base = Number(m[1]) * 12 + Number(m[2]) - 1;
  }

  get latest() {
    return this.length - 1;
  }

  year(i: number) {
    return Math.floor((this.base + i) / 12);
  }

  /** 0 = January */
  month(i: number) {
    return (this.base + i) % 12;
  }

  label(i: number, long = false) {
    return `${(long ? LONG : SHORT)[this.month(i)]} ${this.year(i)}`;
  }

  key(i: number) {
    return `${this.year(i)}-${String(this.month(i) + 1).padStart(2, "0")}`;
  }

  /** Index for a year and 0-based month; may fall outside the data. */
  indexOf(year: number, month: number) {
    return year * 12 + month - this.base;
  }

  /** Index for "YYYY-MM", or null if malformed or outside the data. */
  parseKey(key: string): number | null {
    const m = KEY.exec(key);
    if (!m) return null;
    const i = this.indexOf(Number(m[1]), Number(m[2]) - 1);
    return i >= 0 && i < this.length ? i : null;
  }

  /** Why a range is unusable, or null if it's fine. */
  rangeError(from: number, to: number): string | null {
    if (from > this.latest || to > this.latest) return `The latest data is for ${this.label(this.latest, true)}.`;
    if (from < 0) return `The data starts in ${this.label(0, true)}.`;
    if (from >= to) return "The start month needs to be earlier than the end month.";
    return null;
  }

  /** The last `months` months, ending with the latest data (clamped to the start of the data). */
  preset(months: number): Range {
    return { from: Math.max(0, this.latest - months), to: this.latest };
  }

  /** What the page opens with: the last 5 years. */
  get defaultRange(): Range {
    return this.preset(60);
  }

  /** Range from URL params; anything missing, malformed or invalid falls back to the last 5 years. */
  rangeFromParams(params: { from?: string | string[]; to?: string | string[] }): Range {
    const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
    const fromKey = one(params.from);
    const toKey = one(params.to);
    const from = fromKey ? this.parseKey(fromKey) : null;
    const to = toKey ? this.parseKey(toKey) : null;
    if (from === null || to === null || this.rangeError(from, to)) return this.defaultRange;
    return { from, to };
  }
}

/** Full month names, January first. */
export const MONTH_NAMES = LONG;
