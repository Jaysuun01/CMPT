import { describe, expect, it } from "vitest";
import { monthFromNumber, monthNumber } from "../src/data/months.ts";
import { parseFredCsv } from "../src/data/parse.ts";

const H = "observation_date,WPU101";

describe("parseFredCsv", () => {
  it("parses a clean file into a contiguous monthly series", () => {
    expect(parseFredCsv(`${H}\n2026-07-01,374.388\n2026-08-01,377.806\n2026-09-01,383.330\n`, "WPU101")).toEqual({
      start: "2026-07",
      values: [374.388, 377.806, 383.33],
    });
  });

  it("turns FRED's '.' and empty cells into null", () => {
    expect(parseFredCsv(`${H}\n2026-07-01,.\n2026-08-01,\n2026-09-01,383.33`, "WPU101").values).toEqual([null, null, 383.33]);
  });

  it("fills months missing from the file with null instead of interpolating", () => {
    expect(parseFredCsv(`${H}\n2026-06-01,1\n2026-09-01,4`, "WPU101")).toEqual({ start: "2026-06", values: [1, null, null, 4] });
  });

  it("handles BOM, CRLF, stray whitespace and blank lines", () => {
    const BOM = String.fromCharCode(0xfeff);
    const text = `${BOM}${H}\r\n 2026-08-01 , 377.806 \r\n\r\n2026-09-01,383.330\r\n\r\n`;
    expect(parseFredCsv(text, "WPU101").values).toEqual([377.806, 383.33]);
  });

  it("sorts rows that arrive out of order", () => {
    expect(parseFredCsv(`${H}\n2026-09-01,3\n2026-07-01,1\n2026-08-01,2`, "WPU101")).toEqual({ start: "2026-07", values: [1, 2, 3] });
  });

  it("crosses year boundaries correctly", () => {
    expect(parseFredCsv(`${H}\n2025-12-01,1\n2026-01-01,2`, "WPU101")).toEqual({ start: "2025-12", values: [1, 2] });
  });

  it("returns an empty series for a header-only file", () => {
    expect(parseFredCsv(`${H}\n`, "WPU101")).toEqual({ start: "", values: [] });
  });

  it.each([
    ["the wrong series header", "observation_date,WPU08\n2026-09-01,1", /expected header/],
    ["an empty file", "", /expected header/],
    ["a duplicate month", `${H}\n2026-09-01,1\n2026-09-01,2`, /line 3: duplicate month 2026-09/],
    ["a date that is not the 1st", `${H}\n2026-09-15,1`, /line 2: invalid date/],
    ["an impossible month", `${H}\n2026-13-01,1`, /line 2: invalid date/],
    ["a non-numeric value", `${H}\n2026-09-01,abc`, /line 2: invalid value "abc"/],
    ["a negative value", `${H}\n2026-09-01,-5`, /invalid value "-5"/],
    ["a zero value", `${H}\n2026-09-01,0`, /invalid value "0"/],
    ["an extra column", `${H}\n2026-09-01,1,2`, /expected 2 columns, got 3/],
    ["scientific notation", `${H}\n2026-09-01,1e5`, /invalid value "1e5"/],
    ["a leading decimal point", `${H}\n2026-09-01,.5`, /invalid value ".5"/],
    ["a trailing decimal point", `${H}\n2026-09-01,5.`, /invalid value "5."/],
    ["an explicit plus sign", `${H}\n2026-09-01,+5`, /invalid value "\+5"/],
  ])("rejects %s with a clear message", (_label, text, message) => {
    expect(() => parseFredCsv(text, "WPU101")).toThrow(message);
  });
});

describe("month numbers", () => {
  it("round-trips a month and crosses year boundaries", () => {
    expect(monthFromNumber(monthNumber("2026-12") + 1)).toBe("2027-01");
    expect(monthNumber("2027-03") - monthNumber("2026-11")).toBe(4);
  });

  it.each(["2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", ""])("rejects %j", (bad) => {
    expect(() => monthNumber(bad)).toThrow(`Invalid month "${bad}"`);
  });
});
