// Scoring for the consistency check (backend/eval/consistency.ts): how often repeated runs on the same input agree.
// Pure functions, so the pass/fail rules are covered by `npm test` without calling the model.

export interface Agreement {
  /** The most common result, serialized. */
  mode: string;
  /** How many runs gave it. */
  count: number;
  runs: number;
}

/** The most common value across runs and how many runs gave it. Values are compared as JSON with sorted keys. */
export function agreement(values: readonly unknown[]): Agreement {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = stable(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let mode = "";
  let count = 0;
  for (const [k, c] of counts) {
    if (c > count) [mode, count] = [k, c];
  }
  return { mode, count, runs: values.length };
}

/** JSON with object keys sorted, so equal answers compare equal whatever their key order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

/** One run of the advice step: the action per material, or null when that material got no advice. */
export type AdviceRun = Record<string, string | null> | "failed";

/** Pass or fail, with one printable line per check. */
export interface Verdict {
  ok: boolean;
  lines: string[];
}

/** A material in the check, and whether it has a history lean (and so must get advice in every run). */
export interface Checked {
  material: string;
  hasLean: boolean;
}

/**
 * The pass rule: every run succeeds, the description reads the same every time, and each material gets the same
 * action every time. A material with a history lean must get advice in every run: missing or rejected advice fails,
 * even when it's missing every time. Only a material without a lean may consistently get none.
 */
export function judge(extracts: readonly (unknown | "failed")[], advice: readonly AdviceRun[], materials: readonly Checked[]): Verdict {
  const lines: string[] = [];
  let ok = true;
  const fail = (line: string) => {
    ok = false;
    lines.push(`FAIL ${line}`);
  };

  const extractFailed = extracts.filter((e) => e === "failed").length;
  if (extractFailed) fail(`extract: ${extractFailed} of ${extracts.length} runs failed`);
  const ex = agreement(extracts.filter((e) => e !== "failed"));
  if (ex.runs > 0 && ex.count !== ex.runs) fail(`extract: ${ex.count} of ${ex.runs} runs agree`);
  else if (ex.runs > 0) lines.push(`ok   extract: ${ex.runs} of ${ex.runs} runs identical`);

  if (materials.length === 0) fail("advise: no materials to check (edit consistency-cases.json)");
  const adviceFailed = advice.filter((a) => a === "failed").length;
  if (adviceFailed) fail(`advise: ${adviceFailed} of ${advice.length} runs failed`);
  const good = advice.filter((a): a is Record<string, string | null> => a !== "failed");
  for (const { material: m, hasLean } of materials) {
    const a = agreement(good.map((run) => run[m] ?? null));
    if (a.runs === 0) continue;
    const action = JSON.parse(a.mode) as string | null;
    const missing = good.filter((run) => (run[m] ?? null) === null).length;
    if (hasLean && missing > 0) fail(`advise ${m}: no advice in ${missing} of ${a.runs} runs (missing or rejected)`);
    else if (a.count !== a.runs) fail(`advise ${m}: ${a.count} of ${a.runs} runs agree on ${action ?? "no advice"}`);
    else lines.push(`ok   advise ${m}: ${action ?? "no advice"} in ${a.runs} of ${a.runs} runs`);
  }
  return { ok, lines };
}
