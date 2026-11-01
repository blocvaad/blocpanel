// ספקי הסליקה שמוצעים לוועדים (bloc PAY-M): השורות של המסך, השורה למעלה, ומה כיבוי עושה.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { providersView, offeredSummary, turnOffLine, isMissing202, switchAction, COLLECTION_PROVIDERS } from "../collectionProviders";

const ROWS = [
  { provider: "payplus", offered: true, updated_at: "2026-11-01T08:00:00Z", updated_by: "tal@bloc.co.il" },
  { provider: "cardcom", offered: false, updated_at: "2026-11-01T08:00:00Z", updated_by: null },
  { provider: "management", offered: false },
];

describe("providersView", () => {
  it("the fixed order; a provider without a row is off; counts from the usage (0 when absent)", () => {
    const v = providersView(ROWS, [{ provider: "payplus", buildings: 7 }, { provider: "none", buildings: 40 }]);
    expect(v.map((r) => r.id)).toEqual(["payplus", "cardcom", "grow", "management"]);
    expect(v.map((r) => r.offered)).toEqual([true, false, false, false]);
    expect(v.map((r) => r.buildings)).toEqual([7, 0, 0, 0]);
    expect(v[0]).toMatchObject({ label: "PayPlus", kind: "card", updatedBy: "tal@bloc.co.il" });
    expect(v[3]).toMatchObject({ label: "חברת ניהול", kind: "external", updatedAt: null, updatedBy: null });
  });
  it("the count was not read — null, not 0", () => {
    expect(providersView(ROWS, null).every((r) => r.buildings === null)).toBe(true);
  });
  it("only true is on (a string or a missing value is off)", () => {
    const v = providersView([{ provider: "grow", offered: "true" }], []);
    expect(v.find((r) => r.id === "grow")?.offered).toBe(false);
  });
  it("the four providers of SQL 202, in that order", () => {
    expect(COLLECTION_PROVIDERS.map((p) => p.id)).toEqual(["payplus", "cardcom", "grow", "management"]);
  });
});

describe("offeredSummary", () => {
  const on = (ids: string[]) => providersView(ids.map((p) => ({ provider: p, offered: true })), []);
  it("what a new committee sees", () => {
    expect(offeredSummary(on(["payplus"]))).toBe("ועד חדש רואה: bit, העברה בנקאית ותשלום באשראי דרך PayPlus.");
    expect(offeredSummary(on(["payplus", "cardcom"]))).toBe("ועד חדש רואה: bit, העברה בנקאית ותשלום באשראי דרך PayPlus / Cardcom.");
    expect(offeredSummary(on([]))).toBe("אף ספק אשראי לא מוצע — ועד חדש יכול לגבות רק ב-bit ובהעברה בנקאית.");
    expect(offeredSummary(on(["grow", "management"]))).toBe("ועד חדש רואה: bit, העברה בנקאית ותשלום באשראי דרך Grow (משולם). וגם גבייה דרך חברת ניהול.");
  });
});

describe("turnOffLine", () => {
  const row = (buildings: number | null) => ({ ...providersView([{ provider: "payplus", offered: true }], [])[0], buildings });
  it("connected buildings keep collecting — said with how many", () => {
    expect(turnOffLine(row(7))).toBe("ועדים חדשים לא יראו את PayPlus. 7 בניינים שמחוברים אליו — ממשיכים לגבות דרכו, עד שינתקו.");
    expect(turnOffLine(row(1))).toBe("ועדים חדשים לא יראו את PayPlus. בניין אחד שמחובר אליו — ממשיכים לגבות דרכו, עד שינתקו.");
    expect(turnOffLine(row(0))).toBe("ועדים חדשים לא יראו את PayPlus. אין בניין שמחובר אליו עכשיו.");
    expect(turnOffLine(row(null))).toBe("ועדים חדשים לא יראו את PayPlus. בניינים שכבר מחוברים — ממשיכים לגבות דרכו, עד שינתקו.");
  });
});

describe("isMissing202", () => {
  it("a missing table or function — yes; anything else — no", () => {
    expect(isMissing202({ code: "42P01" })).toBe(true);
    expect(isMissing202({ code: "PGRST205" })).toBe(true);
    expect(isMissing202({ code: "PGRST202" })).toBe(true);
    expect(isMissing202({ message: 'relation "public.platform_payment_providers" does not exist' })).toBe(true);
    expect(isMissing202({ message: "Could not find the function public.panel_payment_provider_usage" })).toBe(true);
    expect(isMissing202({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissing202({ message: "platform_payment_providers: permission denied" })).toBe(false);
    expect(isMissing202(null)).toBe(false);
  });
});

describe("switchAction — turning off asks first, turning on does not", () => {
  it("on → a question first (connected buildings, new committees); off → straight on", () => {
    expect(switchAction({ offered: true }, true, false)).toBe("confirm");
    expect(switchAction({ offered: false }, true, false)).toBe("turn_on");
  });
  it("not a superadmin, or while saving — nothing", () => {
    expect(switchAction({ offered: true }, false, false)).toBe("none");
    expect(switchAction({ offered: false }, false, false)).toBe("none");
    expect(switchAction({ offered: true }, true, true)).toBe("none");
    expect(switchAction({ offered: false }, true, true)).toBe("none");
  });
  it("the card acts on it: the question for confirm, saving only for turn_on", () => {
    const src = readFileSync(join(process.cwd(), "src/components/ui/CollectionProvidersCard.tsx"), "utf8");
    const toggle = src.slice(src.indexOf("function toggle("), src.indexOf("return (", src.indexOf("function toggle(")));
    expect(toggle).toContain("switchAction(row, canEdit, !!busy)");
    expect(toggle).toMatch(/action === "confirm"\) setConfirm\(row\)/);
    expect(toggle).toMatch(/action === "turn_on"\) void save\(row, true\)/);
    expect(toggle).not.toMatch(/save\(row, (false|!row\.offered)\)/);
  });
  it("the card follows the rows the server sends after a refresh (counts, who changed it)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/ui/CollectionProvidersCard.tsx"), "utf8");
    expect(src).toMatch(/useEffect\(\(\) => \{ setList\(rows\); \}, \[rows\]\)/);
  });
});
