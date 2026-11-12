import { describe, expect, it } from "vitest";
import { agreement, judge } from "../eval/consistency-score.ts";

describe("agreement", () => {
  it("finds the most common value and how many runs gave it", () => {
    expect(agreement(["a", "b", "a", "a"])).toEqual({ mode: '"a"', count: 3, runs: 4 });
  });

  it("treats objects with the same content as equal, whatever their key order", () => {
    expect(agreement([{ x: 1, y: [2, { z: 3, w: 4 }] }, { y: [2, { w: 4, z: 3 }], x: 1 }])).toMatchObject({ count: 2, runs: 2 });
    // Array order matters: a different order is a different answer.
    expect(agreement([[1, 2], [2, 1]])).toMatchObject({ count: 1, runs: 2 });
  });

  it("counts null as an answer of its own", () => {
    expect(agreement([null, "a", null])).toEqual({ mode: "null", count: 2, runs: 3 });
  });
});

describe("judge", () => {
  const BOTH = [
    { material: "lumber", hasLean: true },
    { material: "steel", hasLean: true },
  ];
  const EX = { materials: [{ material: "steel", budget: 600000 }], phases: [{ needMonth: "2027-10" }] };
  const SAME = { lumber: "lock-supply", steel: "as-needed" };

  it("passes when every run reads the same and gives each material the same action", () => {
    const v = judge([EX, EX, EX], [SAME, SAME, SAME], BOTH);
    expect(v.ok).toBe(true);
    expect(v.lines).toEqual(["ok   extract: 3 of 3 runs identical", "ok   advise lumber: lock-supply in 3 of 3 runs", "ok   advise steel: as-needed in 3 of 3 runs"]);
  });

  it("fails when one run gives a material a different action", () => {
    const v = judge([EX, EX, EX], [SAME, SAME, { ...SAME, steel: "lock-supply" }], BOTH);
    expect(v.ok).toBe(false);
    expect(v.lines).toContain("FAIL advise steel: 2 of 3 runs agree on as-needed");
    expect(v.lines).toContain("ok   advise lumber: lock-supply in 3 of 3 runs");
  });

  it("fails when advice comes back for a material in some runs but not others", () => {
    const v = judge([EX, EX], [SAME, { ...SAME, lumber: null }], BOTH);
    expect(v.ok).toBe(false);
    expect(v.lines).toContain("FAIL advise lumber: no advice in 1 of 2 runs (missing or rejected)");
  });

  it("fails when the description is read differently in one run", () => {
    const other = { ...EX, phases: [{ needMonth: "2027-09" }] };
    const v = judge([EX, other, EX], [SAME, SAME, SAME], BOTH);
    expect(v.ok).toBe(false);
    expect(v.lines).toContain("FAIL extract: 2 of 3 runs agree");
  });

  it("fails when any call fails, even if the rest agree", () => {
    expect(judge([EX, "failed"], [SAME, SAME], BOTH)).toMatchObject({ ok: false, lines: expect.arrayContaining(["FAIL extract: 1 of 2 runs failed"]) });
    expect(judge([EX, EX], [SAME, "failed"], BOTH)).toMatchObject({ ok: false, lines: expect.arrayContaining(["FAIL advise: 1 of 2 runs failed"]) });
  });

  it("accepts no advice only for a material without a history lean", () => {
    expect(judge([EX, EX], [{ steel: null }, { steel: null }], [{ material: "steel", hasLean: false }])).toMatchObject({
      ok: true,
      lines: expect.arrayContaining(["ok   advise steel: no advice in 2 of 2 runs"]),
    });
  });

  it("fails a material with a lean whose advice is missing or rejected, even in every run", () => {
    const v = judge([EX, EX], [{ steel: null }, { steel: null }], [{ material: "steel", hasLean: true }]);
    expect(v.ok).toBe(false);
    expect(v.lines).toContain("FAIL advise steel: no advice in 2 of 2 runs (missing or rejected)");
  });

  it("fails when there is nothing to check", () => {
    expect(judge([EX, EX], [{}, {}], [])).toMatchObject({ ok: false, lines: expect.arrayContaining(["FAIL advise: no materials to check (edit consistency-cases.json)"]) });
  });
});
