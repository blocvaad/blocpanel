// PANEL-PAY א2 (bloc החלטה 370, MG-S1094): פעולות הצוות על חבר / ועד נרשמות ב-bloc בזוג — גלויה (building_id, בלי איש
// הצוות) ופנימית (building_id null, target_building_id, panel_actor). דף האדם — מרונדר לשרת (renderToStaticMarkup; בפאנל
// אין happy-dom) — מציג את הפעולה פעם אחת, "צוות bloc", את המייל ואת שם הבניין; שורה ישנה עם panel_admin — כמו קודם.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
import PersonView from "../PersonView";
import { oneEntryPerAction } from "@/lib/blocAudit";
import type { PersonDetail } from "@/lib/people";

const B1 = "11111111-1111-4111-8111-111111111111";
const ACTOR = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "ops@bloc.co.il", role: "admin" };
type Log = PersonDetail["blocLog"];

const detail = (blocLog: Log, buildingNames: Record<string, string> = { [B1]: "השקד 104" }): PersonDetail => ({
  person: {
    id: "u1", full_name: "דנה לוי", email: "dana@example.com", phone: "0501234567", avatar_url: null, role: "tenant", building_id: B1,
    approval_status: "approved", created_at: "2026-01-01T10:00:00Z", deleted_at: null, is_onboarded: true, totp_enabled: false,
  } as PersonDetail["person"],
  memberships: [], blocks: [], openBlock: null, blocksUnavailable: false, payments: [], paymentsTruncated: false,
  buildingNames, panelLog: [], blocLog, companies: [], supplier: null, failed: [],
});
const html = (d: PersonDetail) => renderToStaticMarkup(createElement(PersonView, { detail: d, canAct: false, buildings: [] }));
/** the activity section ("מה נעשה") only */
const activity = (h: string) => h.slice(h.indexOf("מה נעשה"));

describe("the person page, bloc's log (bloc 370 pairs)", () => {
  // what loadPerson hands over: bloc's two rows through oneEntryPerAction (the internal one stays)
  const pair: Log = oneEntryPerAction([
    { id: "v", action: "admin_promoted", building_id: B1, created_at: "2026-11-15T08:00:00.001Z", details: { via: "panel", ref: "r1", event: "set_role" } },
    { id: "i", action: "admin_promoted", building_id: null, created_at: "2026-11-15T08:00:00.002Z", details: { via: "panel", ref: "r1", target_building_id: B1, panel_actor: ACTOR, panel_note: "אומת מול הוועד" } },
  ]);
  it("a visible + internal pair is ONE entry, by 'צוות bloc', with the staff email and the building's name", () => {
    expect(pair.map((r) => r.id)).toEqual(["i"]);
    const a = activity(html(detail(pair)));
    expect(a.split("מונה/תה לוועד").length - 1).toBe(1);
    expect(a).toContain("מונה/תה לוועד (השקד 104)");
    expect(a).toContain("צוות bloc");
    expect(a).toContain('<bdi dir="ltr">ops@bloc.co.il</bdi>');
  });
  it("an older row (panel_admin, building_id on the row) still shows its email and building", () => {
    const older: Log = [{ id: "o", action: "tenant_approved", building_id: B1, created_at: "2026-10-01T08:00:00Z", details: { via: "panel", panel_admin: "old@bloc.co.il" } }];
    const a = activity(html(detail(older)));
    expect(a).toContain("ההצטרפות אושרה (השקד 104)");
    expect(a).toContain('<bdi dir="ltr">old@bloc.co.il</bdi>');
  });
  it("an app action (not via the panel) is 'באפליקציה', with no email; a building the page could not name — no name", () => {
    const own: Log = [{ id: "a", action: "profile_updated", building_id: null, created_at: "2026-10-02T08:00:00Z", details: { target_building_id: "22222222-2222-4222-8222-222222222222" } }];
    const a = activity(html(detail(own)));
    expect(a).toContain(">הפרטים עודכנו<");          // no "(building)" — the page has no name for it
    expect(a).toContain("<bdi>באפליקציה</bdi>, ");     // no "(email)" after who
  });
});
