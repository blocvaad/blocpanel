// PANEL-PAY א1 (החלטה 363): טופס העריכה וטופס הבניין החדש — בלי מסלול ובלי "סיבה למנוי ללא תשלום". מרונדרים לשרת.
// המסלול עבר לכרטיס "מסלול בלי חיוב" בדף הבניין, והטפסים אומרים את זה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
import { BuildingEditFormView, editBody } from "../BuildingEditForm";
import NewBuildingPage from "@/app/(panel)/buildings/new/page";

const PLAN_WORDS = ["תוכנית", "סיבה למנוי", "Core", "Plus", "Management Start", "comp_reason", "₪59"];

describe("edit form", () => {
  const h = renderToStaticMarkup(createElement(BuildingEditFormView, {
    id: "b1", form: { name: "השקד 104", address: "השקד 104, חולון", max_tenants: "40" }, loading: false, error: "", success: false,
  }));
  it("name, address, max tenants — and nothing about a plan", () => {
    expect(h).toContain('data-building-edit=""');
    expect(h).toContain('value="השקד 104"');
    expect(h).toContain('value="40"');
    for (const w of PLAN_WORDS) expect(h, w).not.toContain(w);
  });
  it("says where the plan moved, with a link to the building page", () => {
    expect(h).toContain('data-plan-moved-note=""');
    expect(h).toContain("&quot;מסלול בלי חיוב&quot;");
    expect(h).toContain('href="/buildings/b1"');
  });
  it("error and success lines", () => {
    const e = renderToStaticMarkup(createElement(BuildingEditFormView, { id: "b1", form: { name: "x", address: "", max_tenants: "1" }, loading: false, error: "השמירה נכשלה. נסו שוב.", success: false }));
    expect(e).toContain('role="alert"');
    const s = renderToStaticMarkup(createElement(BuildingEditFormView, { id: "b1", form: { name: "x", address: "", max_tenants: "1" }, loading: true, error: "", success: true }));
    expect(s).toContain("עודכן בהצלחה");
    expect(s).toContain("שומר...");
  });
  it("the PATCH body is name / address / max_tenants only", () => {
    expect(editBody({ name: "a", address: "b", max_tenants: "12" })).toEqual({ name: "a", address: "b", max_tenants: 12 });
  });
});

describe("new building", () => {
  it("step 1 has no plan select and no reason field; it says a new building opens without a plan", () => {
    const h = renderToStaticMarkup(createElement(NewBuildingPage));
    expect(h).toContain("פרטי הבניין");
    expect(h).not.toContain("<select");
    for (const w of PLAN_WORDS) expect(h, w).not.toContain(w);
    expect(h).toContain('data-plan-moved-note=""');
    expect(h).toContain("הבניין נפתח בלי מסלול");
  });
  it("wiring: the pages send no plan field", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
    const edit = read("app/(panel)/buildings/[id]/edit/page.tsx");
    const neu = read("app/(panel)/buildings/new/page.tsx");
    for (const src of [edit, neu]) {
      expect(src).not.toMatch(/PLAN_OPTIONS|comp_reason|plan:/);
    }
    expect(edit).toContain("JSON.stringify(editBody(form))");
    expect(neu).toContain("name: form.name, address: form.address, max_tenants: form.max_tenants,");
  });
});
