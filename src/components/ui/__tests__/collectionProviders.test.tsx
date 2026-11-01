// ספקי סליקה (bloc PAY-M) — הכרטיס בפאנל (מרונדר לשרת): מתג לכל ספק עם המצב שלו, כמה בניינים מחוברים, מי שינה,
// השורה למעלה; לפני SQL 202 / בכשל — אומרים את זה; מי שאינו סופר-אדמין רואה בלי לשנות.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
import CollectionProvidersCard from "../CollectionProvidersCard";
import { providersView } from "@/lib/collectionProviders";

const rows = providersView(
  [{ provider: "payplus", offered: true, updated_at: "2026-11-01T08:00:00Z", updated_by: "tal@bloc.co.il" }, { provider: "cardcom", offered: false }],
  [{ provider: "payplus", buildings: 7 }, { provider: "cardcom", buildings: 1 }],
);
const html = (o: Partial<{ state: "ok" | "missing" | "error"; canEdit: boolean }> = {}) =>
  renderToStaticMarkup(createElement(CollectionProvidersCard, { rows, state: o.state ?? "ok", canEdit: o.canEdit ?? true }));

describe("CollectionProvidersCard", () => {
  it("a switch for each of the four, with its state and name", () => {
    const h = html();
    for (const id of ["payplus", "cardcom", "grow", "management"]) expect(h).toContain(`data-provider-switch="${id}"`);
    expect(h).toMatch(/role="switch" aria-checked="true" aria-label="PayPlus — מוצע לוועדים"/);
    expect(h).toMatch(/role="switch" aria-checked="false" aria-label="Cardcom — מוצע לוועדים"/);
  });
  it("how many buildings are connected, and who changed it", () => {
    const h = html();
    expect(h).toContain("7 בניינים מחוברים");
    expect(h).toContain("בניין אחד מחובר");
    expect(h).toContain("אין בניין שמחובר אליו");
    expect(h).toContain("tal@bloc.co.il");
  });
  it("the line on top — what a new committee sees", () => {
    expect(html()).toContain("ועד חדש רואה: bit, העברה בנקאית ותשלום באשראי דרך PayPlus.");
  });
  it("only a superadmin changes: for the rest the switches are disabled, and it says why", () => {
    const h = html({ canEdit: false });
    expect((h.match(/role="switch"[^>]*disabled=""/g) ?? []).length).toBe(4);
    expect(h).toContain("רק סופר-אדמין משנה את הספקים.");
    expect(html()).not.toContain("disabled=\"\"");
  });
  it("before SQL 202 — says so, without switches; a failed read — an error, without switches", () => {
    const m = html({ state: "missing" });
    expect(m).toContain("צריך להריץ את SQL 202 של bloc");
    expect(m).not.toContain('role="switch"');
    const e = html({ state: "error" });
    expect(e).toContain('role="alert"');
    expect(e).not.toContain('role="switch"');
  });
  it("the resident sees no provider name; switching a provider is explained", () => {
    expect(html()).toContain("בניין שכבר מחובר ממשיך לגבות דרך הספק שלו");
  });
});
