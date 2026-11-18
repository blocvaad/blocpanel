// STORIES-1 (bloc, החלטות 439, 441) — מסך המיתון של הסטורי, מרונדר לשרת (כמו studio.test.tsx: בלי happy-dom; התצוגה בלי hooks
// נקראת ישירות). חסר SQL / נכשל / ריק / רשימה — מצבים שונים; אף פעם לא מי דיווח; כפתורים לפי ההרשאה; האישור אומר מה יקרה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
import { StoriesQueueView, askText, actionBody, STORIES_EMPTY_TEXT, STORIES_FAILED_TEXT, STORIES_PRIVACY_TEXT, STORIES_SQL_MISSING_TEXT, type StoriesQueueViewProps } from "../StoriesQueue";

const B = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const group = {
  key: `${B}:market:${SID}`, building_id: B, building: "השקד 104", source: "market" as const, source_id: SID,
  item: { title: "ספה למסירה", text: null, photo: "https://x.supabase.co/storage/v1/object/public/m/1.jpg", gone: false },
  count: 3, reasons: [{ reason: "offensive" as const, label: "פוגעני או לא ראוי", count: 2 }, { reason: "spam" as const, label: "ספאם או פרסום", count: 1 }],
  first: "2026-11-18T08:00:00Z", last: "2026-11-18T09:30:00Z",
};
const hidden = { building_id: B, building: "השקד 104", source: "announcement" as const, source_id: SID, reason: "פרטים אישיים", hidden_by: "tal@bloc.co.il", created_at: "2026-11-17T10:00:00Z", item: { title: "הודעה", text: "טקסט", photo: null, gone: false } };
const pilot = { building_id: B, building: "השקד 104", enabled_by: "tal@bloc.co.il", note: "פיילוט ראשון", created_at: "2026-11-16T10:00:00Z" };
const base = (over: Partial<StoriesQueueViewProps> = {}): StoriesQueueViewProps => ({
  data: { state: "ok", reports: [group], hidden: [hidden], pilot: [pilot], truncated: false, openTotal: 3, hiddenTruncated: false },
  canManage: true, canPilot: false, busy: false, ask: null, reason: "", error: null, done: null, pilotId: "", pilotNote: "",
  onAsk: () => {}, onCancel: () => {}, onConfirm: () => {}, onReason: () => {}, onRefresh: () => {}, onPilotId: () => {}, onPilotNote: () => {}, onPilotOn: () => {},
  ...over,
});
const html = (p: StoriesQueueViewProps) => renderToStaticMarkup(createElement(StoriesQueueView, p));

describe("the stories moderation screen", () => {
  it("not installed / failed / empty are three different screens — a failed read never looks like no reports", () => {
    expect(html(base({ data: { state: "missing" } }))).toContain(STORIES_SQL_MISSING_TEXT);
    const failed = html(base({ data: { state: "error" } }));
    expect(failed).toContain(STORIES_FAILED_TEXT);
    expect(failed).toContain("נסו שוב");
    expect(failed).not.toContain(STORIES_EMPTY_TEXT);
    const empty = html(base({ data: { state: "ok", reports: [], hidden: [], pilot: [], truncated: false, openTotal: 0, hiddenTruncated: false } }));
    expect(empty).toContain(STORIES_EMPTY_TEXT);
    expect(empty).toContain("אין בניינים בפיילוט — הסטורי כבוי בכל מקום.");
  });

  it("a report group: how many, the building, the item and why — never who reported", () => {
    const out = html(base());
    expect(out).toContain("3 דיווחים");
    expect(out).toContain("השקד 104");
    expect(out).toContain("ספה למסירה");
    expect(out).toContain("פוגעני או לא ראוי (2) · ספאם או פרסום");
    expect(out).toContain(STORIES_PRIVACY_TEXT);
    expect(out).not.toMatch(/reporter|מי דיווח:/);
    expect(out).toContain('data-story-thumb="image"');
  });

  it("buttons follow the permission: a viewer sees no actions; an admin hides and dismisses; only a superadmin opens or closes a pilot", () => {
    const viewer = html(base({ canManage: false, canPilot: false }));
    expect(viewer).not.toContain("data-story-hide");
    expect(viewer).not.toContain("data-story-unhide");
    expect(viewer).not.toContain("data-story-pilot-on");
    const admin = html(base());
    expect(admin).toContain("data-story-hide");
    expect(admin).toContain("data-story-dismiss");
    expect(admin).toContain("data-story-unhide");
    expect(admin).not.toContain("data-story-pilot-off");
    const sup = html(base({ canPilot: true }));
    expect(sup).toContain("data-story-pilot-off");
    expect(sup).toContain("data-story-pilot-on");
  });

  it("the pilot opens only for a real building id; a cut hidden list says it shows the latest 200", () => {
    const btn = (h: string) => /<button[^>]*>לפתוח את הסטורי בבניין<\/button>/.exec(h)![0];
    expect(btn(html(base({ canPilot: true, pilotId: "" })))).toContain("disabled");
    expect(btn(html(base({ canPilot: true, pilotId: "not-a-building" })))).toContain("disabled");
    expect(btn(html(base({ canPilot: true, pilotId: B })))).not.toContain("disabled");
    const ok = base().data as Extract<StoriesQueueViewProps["data"], { state: "ok" }>;
    expect(html(base({ data: { ...ok, hiddenTruncated: true } }))).toContain("מוצגים 200 האחרונים.");
    expect(html(base())).not.toContain("מוצגים 200 האחרונים.");
  });

  it("an item that was deleted can only be dismissed — there is nothing to hide", () => {
    const out = html(base({ data: { state: "ok", reports: [{ ...group, item: { title: "הפריט נמחק", text: null, photo: null, gone: true } }], hidden: [], pilot: [], truncated: false, openTotal: 1, hiddenTruncated: false } }));
    expect(out).not.toContain("data-story-hide");
    expect(out).toContain("data-story-dismiss");
  });

  it("the confirm says what will happen; hide needs a reason of 3+ characters; the body sent to bloc", () => {
    const ask = { kind: "hide" as const, g: group };
    expect(askText(ask)).toBe('הפריט "ספה למסירה" ייצא מהסטורי של השקד 104, ו-3 הדיווחים עליו ייסגרו. ההודעה או המודעה עצמן לא משתנות.');
    const out = html(base({ ask, reason: "x" }));
    expect(out).toContain("data-story-reason");
    expect(out).toMatch(/data-story-confirm-go=""[^>]*disabled|disabled=""[^>]*data-story-confirm-go/);
    expect(actionBody(ask, "  תמונה פוגענית ")).toEqual({ action: "hide", building_id: B, source: "market", source_id: SID, reason: "תמונה פוגענית" });
    expect(actionBody({ kind: "dismiss", g: group }, "")).toEqual({ action: "dismiss", building_id: B, source: "market", source_id: SID });
    expect(actionBody({ kind: "unhide", h: hidden }, "")).toEqual({ action: "unhide", building_id: B, source: "announcement", source_id: SID });
    expect(actionBody({ kind: "pilot_off", p: pilot }, "")).toEqual({ action: "pilot_off", building_id: B });
    expect(askText({ kind: "dismiss", g: { ...group, count: 1 } })).toBe('הדיווח ייסגר כ"נבדק", והפריט יישאר בסטורי של השקד 104.');
  });
});
