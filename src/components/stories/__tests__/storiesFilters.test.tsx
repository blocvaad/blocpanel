// MOD-1 (bloc MG-S1211) — תור המיתון של הסטורי: הסינון (קישורים), היעד לבדיקה לכל פריט, וריק בסינון שונה מ"אין דיווחים".
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
import { StoriesQueueView, STORIES_EMPTY_FILTERED_TEXT, STORIES_EMPTY_TEXT, type StoriesQueueViewProps } from "../StoriesQueue";
import { storyFilterOf } from "@/lib/storiesPanel";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const B = "11111111-1111-4111-8111-111111111111", B2 = "33333333-3333-4333-8333-333333333333";
const SID = "22222222-2222-4222-8222-222222222222";
const group = (o: Record<string, unknown> = {}) => ({
  key: `${B}:market:${SID}`, building_id: B, building: "השקד 104", source: "market" as const, source_id: SID,
  item: { title: "ספה למסירה", text: null, photo: null, gone: false },
  count: 2, reasons: [{ reason: "private" as const, label: "חושף מידע אישי", count: 2 }], first: "2026-11-21T20:00:00Z", last: "2026-11-22T09:30:00Z", ...o,
});
const base = (over: Partial<StoriesQueueViewProps> = {}): StoriesQueueViewProps => ({
  data: { state: "ok", reports: [group(), group({ key: `${B2}:market:${SID}`, building_id: B2, building: "הרצל 12", count: 1, first: "2026-11-22T11:00:00Z", last: "2026-11-22T11:00:00Z", reasons: [{ reason: "spam", label: "ספאם או פרסום", count: 1 }] })],
    hidden: [], pilot: [], truncated: true, openTotal: 500, hiddenTruncated: false, platform: true, switchedOff: [], switchesMissing: false, order: "oldest" },
  canManage: true, canPilot: false, busy: false, ask: null, reason: "", error: null, done: null, pilotId: "", pilotNote: "",
  onAsk: () => {}, onCancel: () => {}, onConfirm: () => {}, onReason: () => {}, onRefresh: () => {}, onPilotId: () => {}, onPilotNote: () => {}, onPilotOn: () => {},
  filter: storyFilterOf({}), now: NOW, ...over,
});
const html = (p: StoriesQueueViewProps) => renderToStaticMarkup(createElement(StoriesQueueView, p));

describe("the stories queue — filters and targets", () => {
  it("each item: the target by its most serious reason (late / ok); the hint says which 300 are shown", () => {
    const out = html(base());
    expect(out).toContain("באיחור של 4 שעות");
    expect(out).toContain('data-story-sla="late"');
    expect(out).toContain('data-story-sla="ok"');
    expect(out).toContain("מוצגים 300 הדיווחים הישנים ביותר מתוך 500, והסינון הוא עליהם.");
    expect(out).toContain("היעד לבדיקה: מידע אישי תוך 12 שעות");
  });

  it("the filters are links: sort, reason, age, building (two buildings)", () => {
    const out = html(base({ filter: storyFilterOf({ reason: "private" }) }));
    expect(out).toContain('href="/stories?sort=oldest&amp;reason=private"');
    expect(out).toContain('href="/stories?reason=private&amp;age=day"');
    expect(out).toContain(`href="/stories?reason=private&amp;building=${B2}"`);
    expect(out).toContain("השקד 104 (2)");
    expect(out).toContain("ספה למסירה");
  });

  it("nothing under the filter is not 'no reports' — and offers to clear it", () => {
    const out = html(base({ filter: storyFilterOf({ reason: "wrong" }) }));
    expect(out).toContain(STORIES_EMPTY_FILTERED_TEXT);
    expect(out).toContain('href="/stories"');
    expect(out).not.toContain(STORIES_EMPTY_TEXT);
  });
});
