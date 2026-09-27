import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "../csv";

describe("csv — safe export (formula injection + RFC-4180)", () => {
  it("neutralizes spreadsheet formulas at the start of a text cell", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+972", "-1+1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("leaves real numbers numeric (negative amounts are not formulas)", () => {
    expect(csvCell(-150)).toBe("-150");
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(Number.NaN)).toBe("");
  });
  it("quotes commas / quotes / newlines and doubles inner quotes", () => {
    expect(csvCell('שם "טוב"')).toBe('"שם ""טוב"""');
    expect(csvCell("א,ב")).toBe('"א,ב"');
    expect(csvCell("שורה\nשנייה")).toBe('"שורה\nשנייה"');
    expect(csvCell("רגיל")).toBe("רגיל");
  });
  it("null/undefined → empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("toCsv: BOM + CRLF, header first, one line per row", () => {
    const out = toCsv(["a", "b"], [[1, "x"], [2, "=1+1"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    const lines = out.slice(1).split("\r\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("1,x");
    expect(lines[2]).toBe("2,'=1+1");
    expect(lines[3]).toBe("");
  });
});
