// PAY-1b (G14): הכרטיס עם השער — פתוח / סגור, מתג חסום עם הרמז, פתיחה מחדש רק כשכבוי. מרונדר לשרת (renderToStaticMarkup),
// כמו שאר בדיקות הכרטיס בפאנל: בפאנל אין happy-dom ואין testing-library. הלוגיקה של הדיאלוג (ולידציה, התשובה מהשרת, מתי מותר
// להדליק) — בפונקציות של lib/collectionProviders, שנבדקות כאן ישירות; החיווט שלהן בכרטיס — נעוץ בקוד המקור.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
import CollectionProvidersCard from "../CollectionProvidersCard";
import { providersView, validateGateEvidence, gateFromDb, switchAction, turnOnBlocked, canReopenGate } from "@/lib/collectionProviders";

const NONE = { gate_closed_at: null, gate_closed_by: null, gate_evidence: null };
const CLOSED = { gate_closed_at: "2026-11-14T09:00:00Z", gate_closed_by: "tal@bloc.co.il", gate_evidence: "אושר מול Grow במייל" };
const HINT = "אפשר להציע ספק לוועדים רק אחרי שתועד שסף ההפעלה שלו (G14) נסגר";
const base = [
  { provider: "payplus", offered: true, ...NONE },
  { provider: "cardcom", offered: false, ...NONE },
  { provider: "grow", offered: false, ...CLOSED },
  { provider: "management", offered: false },
];

const html = (dbRows: any[], canEdit = true, gateColumns = true) =>
  renderToStaticMarkup(createElement(CollectionProvidersCard, { rows: providersView(dbRows, [], gateColumns), state: "ok", canEdit }));
/** כל השורה של ספק (<li data-provider-row=…>…</li>). */
const rowOf = (h: string, id: string) => {
  const m = h.match(new RegExp(`<li[^>]*data-provider-row="${id}"[^>]*>[\\s\\S]*?</li>`));
  return m ? m[0] : null;
};
/** התג הפותח של המתג של ספק — האם הוא חסום. */
const switchDisabled = (h: string, id: string) => {
  const m = h.match(new RegExp(`<button[^>]*data-provider-switch="${id}"[^>]*>`));
  if (!m) throw new Error(`no switch for ${id}`);
  return /\sdisabled(=""|\s|>)/.test(m[0]);
};
const rows = (dbRows: any[], gateColumns = true) => providersView(dbRows, [], gateColumns);
const row = (dbRows: any[], id: string) => rows(dbRows).find((r) => r.id === id)!;

describe("gate display", () => {
  it("open gate: says so, the ON switch is disabled with the Hebrew hint; closed gate: who / when / evidence, switch enabled", () => {
    const h = html(base);
    const cardcom = rowOf(h, "cardcom")!;
    expect(cardcom).toContain('data-gate-state="open"');
    expect(cardcom).toContain("שער G14 פתוח — עוד לא תועדה סגירה");
    expect(cardcom).toContain(HINT);
    expect(switchDisabled(h, "cardcom")).toBe(true);
    const grow = rowOf(h, "grow")!;
    expect(grow).toContain('data-gate-state="closed"');
    expect(grow).toContain("tal@bloc.co.il");
    expect(grow).toContain("אושר מול Grow במייל");
    expect(grow).not.toContain("data-gate-hint");
    expect(switchDisabled(h, "grow")).toBe(false);
  });
  it("management has no gate and a plain switch", () => {
    const h = html(base);
    expect(rowOf(h, "management")).not.toContain("data-gate-row");
    expect(switchDisabled(h, "management")).toBe(false);
  });
  it("OFF is always allowed: PayPlus ON with an open gate keeps an enabled switch and no hint", () => {
    const h = html(base);
    expect(rowOf(h, "payplus")).toContain("שער G14 פתוח");
    expect(rowOf(h, "payplus")).not.toContain("data-gate-hint");
    expect(switchDisabled(h, "payplus")).toBe(false);
  });
  it("the disabled ON switch does nothing even if clicked (switchAction is 'none' for a blocked row)", () => {
    expect(turnOnBlocked(row(base, "cardcom"))).toBe(true);
    expect(switchAction(row(base, "cardcom"), true, false)).not.toBe("turn_on");
    expect(switchAction(row(base, "grow"), true, false)).toBe("turn_on");
    expect(switchAction(row(base, "payplus"), true, false)).toBe("confirm");
  });
  it("columns missing: the card as today (no gate rows, switches enabled) with the SQL 225 note; no crash", () => {
    const h = html(base.map(({ provider, offered }) => ({ provider, offered })), true, false);
    expect(h).not.toContain("data-gate-row");
    expect(h).toContain("data-gate-missing");
    expect(h).toContain("SQL 225");
    for (const id of ["payplus", "cardcom", "grow", "management"]) expect(switchDisabled(h, id)).toBe(false);
  });
  it("not superadmin: no gate buttons, switches disabled", () => {
    const h = html(base, false);
    expect(h).not.toMatch(/data-gate-close="[a-z]/);   // ("data-gate-closed" is the closed gate's line, not a button)
    expect(h).not.toContain("data-gate-reopen=");
    for (const id of ["payplus", "cardcom", "grow"]) expect(switchDisabled(h, id)).toBe(true);
  });
  it("the record dialog is closed until the button opens it", () => {
    const h = html(base);
    expect(h).not.toContain("data-gate-dialog");
    expect(rowOf(h, "cardcom")).toContain('data-gate-close="cardcom"');
    expect(rowOf(h, "grow")).not.toMatch(/data-gate-close="[a-z]/);
  });
});

describe("close dialog (the logic it uses)", () => {
  it("evidence under 10 characters (after trimming) is refused with the Hebrew error; valid evidence is trimmed", () => {
    const short = validateGateEvidence("קצר");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toContain("10");
    expect(validateGateEvidence("   123456789   ").ok).toBe(false);
    expect(validateGateEvidence("  אושר מול Cardcom 12/11  ")).toEqual({ ok: true, value: "אושר מול Cardcom 12/11" });
  });
  it("the server's answer becomes the row's gate: closed after close_gate, open after reopen_gate", () => {
    const closed = gateFromDb("cardcom", { provider: "cardcom", offered: false, ...CLOSED, gate_evidence: "אושר מול Cardcom 12/11" }, true);
    expect(closed.closed).toBe(true);
    expect(closed.evidence).toBe("אושר מול Cardcom 12/11");
    expect(gateFromDb("grow", { provider: "grow", offered: false, ...NONE }, true).closed).toBe(false);
  });
});

describe("reopen", () => {
  it("only on a closed gate of a provider that is OFF; ON shows the explanation instead of a button", () => {
    const db = [{ provider: "grow", offered: false, ...CLOSED }, { provider: "cardcom", offered: true, ...CLOSED }, { provider: "payplus", offered: false, ...NONE }];
    const h = html(db);
    expect(rowOf(h, "grow")).toContain('data-gate-reopen="grow"');
    expect(rowOf(h, "cardcom")).not.toContain("data-gate-reopen=");
    expect(rowOf(h, "cardcom")).toContain("אפשר לפתוח מחדש רק כשהספק כבוי.");
    expect(rowOf(h, "payplus")).not.toContain("data-gate-reopen=");
    expect(canReopenGate(row(db, "grow"), true)).toBe(true);
    expect(canReopenGate(row(db, "grow"), false)).toBe(false);
    expect(canReopenGate(row(db, "cardcom"), true)).toBe(false);
  });
});

// החיווט בכרטיס: מה נשלח, מתי הדיאלוג נסגר, ושהשגיאה מהשרת מוצגת — נעוץ בקוד (בפאנל אין DOM לבדיקות לחיצה).
describe("wiring (the card's source)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/ui/CollectionProvidersCard.tsx"), "utf8");
  it("close: validates first, posts close_gate with the trimmed evidence, closes the dialog only when the server said ok", () => {
    expect(src).toContain("const v = validateGateEvidence(evidence);");
    expect(src).toContain("if (!v.ok) { setEvidenceError(v.error); return; }");
    expect(src).toContain('{ action: "close_gate", evidence: v.value }');
    expect(src).toContain("if (ok) setGateDialog(null);");
    expect(src).toContain("body: JSON.stringify({ provider: row.id, ...body })");
  });
  it("reopen posts reopen_gate; the row takes the gate from the server's answer; an error is shown, the gate unchanged", () => {
    expect(src).toContain('action: "reopen_gate"');
    expect(src).toContain("const gate = gateFromDb(row.id, j.provider ?? {}, true);");
    expect(src).toContain('setMsg({ ok: false, text: j.error ?? "השינוי לא נשמר. נסו שוב." });');
  });
  it("a blocked switch is disabled in the markup and the toggle goes through switchAction", () => {
    expect(src).toContain("disabled={!canEdit || !!busy || turnOnBlocked(r)}");
    expect(src).toContain("const action = switchAction(row, canEdit, !!busy);");
  });
});
