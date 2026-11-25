// bloc HOME-STUDIO-1 (החלטות 684–694) — המסך "מסך הבית" בפאנל, מרונדר לשרת (בפאנל אין happy-dom ואין testing-library), עם הצורה
// המדויקת שהנתיב מחזיר (GET /api/home-studio → stateFromReply).
//   • טוען / נכשל / לפני SQL 256 / רשימה — מצבים שונים; כשל אף פעם לא נראה כמו "אין כרטיסים".
//   • המפה: השורות לפי הסדר, הכרטיסים בכל מקום, "+ כאן" רק למי שמנהל; אזהרה כשיותר מ-2 מוצגים; המתג.
//   • שורת כרטיס: מצב, תוקף, 7 ימים (אחוז לחיצה "—" בלי צפיות), כפתורים לפי הרשאה.
//   • העורך: כרטיס חדש מתבנית — טיוטה, הטלפון מציג אותו במקום שנבחר; צפייה בלבד; מפורסם — השהיה / ארכיון; בבדיקה — למי.
//   • הטלפון: כל צורה כמו ב-bloc (תמונה בלבד = התמונה עם X; כחול מלא; ריבועים; גלילה; רשימה; עיגולים; ערימה), ספירה לאחור, קהל.
//   • הספירות (KPI + 30 עמודות), "מה חדש ב-bloc" (רשימה ועורך).
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => "/home-studio" }));
import HomeStudioClient, { stateFromReply, CardRow, TemplatePicker, HomeMap, type HsState } from "../HomeStudioClient";
import CardEditor from "../CardEditor";
import { PhoneCard, PhoneFrame } from "../StudioPhone";
import { StatsView } from "../CardStats";
import UpdatesPanel, { UpdateEditor } from "../UpdatesPanel";
import { STUDIO_IMAGE_BASE } from "@/components/ads/studio/kit";
import { endIso, formFromCard, formFromTemplate, parseCard, parseUpdate, type PreviewCard, type StudioCard, type StudioUpdate } from "@/lib/homeStudio";

const html = (el: any) => renderToStaticMarkup(el);
const NOW = new Date("2026-11-25T10:00:00Z");
const C1 = "c1000000-0000-4000-8000-000000000001";
const C2 = "c1000000-0000-4000-8000-000000000002";
const C3 = "c1000000-0000-4000-8000-000000000003";
const U1 = "d1000000-0000-4000-8000-000000000001";
// an image of ours: under the bucket of the project the panel is set to (the test env may set one)
const IMG = `${STUDIO_IMAGE_BASE ?? "https://abc.supabase.co/storage/v1/object/public/ads/"}studio/2026-11/x.png`;
function row(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: C1, name: "טיפ שבועי", shape: "banner", slot: "after_tiles", position: 0, source: "manual",
    content: { title: null, subtitle: null, style: "soft", countdown: false, items: [{ id: "a1", title: "ידעתם?", body: "אפשר לצלם תקלה.", image_url: null, image_alt: null, icon: "bulb", accent: "amber", link: { kind: "route", path: "/services" }, cta: "לתקלות", badge: null }] },
    audience: { roles: ["tenant", "vaad"], cities: [], plans: [], new_days: null, rollout: 100 }, starts_at: null, ends_at: null, frequency: "until_closed",
    status: "draft", test_emails: [], version: 1, created_by: "team@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: null, ...o,
  };
}
const card = (o: Record<string, unknown> = {}) => parseCard(row(o)) as StudioCard;
const live = (o: Record<string, unknown> = {}) => card({ status: "live", published_at: "2026-11-21T00:00:00Z", ...o });
const UPD = { id: U1, title: "צ'אט חדש", body: "עכשיו אפשר לענות להודעה.", image_url: null, link: "/chat", roles: ["tenant", "vaad"], status: "live", version: 1, created_by: "x@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: "2026-11-21T00:00:00Z" };
const update = (o: Record<string, unknown> = {}) => parseUpdate({ ...UPD, ...o }) as StudioUpdate;
/** what GET /api/home-studio sends (lib/homeStudioServer → { state: "ok", ...list }) */
const reply = (cards: Record<string, unknown>[], o: Record<string, unknown> = {}) => ({ state: "ok", enabled: true, cards, updates: [UPD], totals: { [C1]: { views: 40, taps: 6, closes: 2, swipes: 0, ends: 0 } }, unknown: 0, ...o });
const screen = (state: HsState, canManage = true) => html(createElement(HomeStudioClient, { canManage, myEmail: "tal@bloc.co.il", initial: state }));

describe("the screen states (GET /api/home-studio → stateFromReply)", () => {
  it("loading / failed / before 256 / ok are different screens; a failure never says there are no cards", () => {
    expect(screen({ phase: "loading" })).toContain('data-hs-loading=""');
    const failed = screen(stateFromReply(502, { state: "error", message: "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע." }));
    expect(failed).toContain("bloc לא הצליח לקרוא כרגע.");
    expect(failed).toContain('data-hs-retry=""');
    expect(failed).not.toContain("עוד אין כרטיסים");
    expect(screen(stateFromReply(503, { state: "missing" }))).toContain("SQL 256");
    expect(stateFromReply(200, { state: "ok", cards: "x" })).toMatchObject({ phase: "failed" });
    expect(stateFromReply(200, null)).toMatchObject({ phase: "failed" });
    const empty = screen(stateFromReply(200, reply([], { updates: [] })));
    expect(empty).toContain("עוד אין כרטיסים.");
    expect(empty).toContain('data-hs-map=""');
  });
  it("the server's unknown count is kept: a banner that the panel needs an update", () => {
    const s = stateFromReply(200, reply([row()], { unknown: 2 }));
    expect(s).toMatchObject({ phase: "ok", unknown: 2 });
    expect(screen(s)).toContain("2 פריטים מ-bloc לא מוצגים כאן");
    // one — in the singular
    expect(screen(stateFromReply(200, reply([row()], { unknown: 1 })))).toContain("פריט אחד מ-bloc לא מוצג כאן, כי הפאנל לא מכיר את הצורה שלו.");
  });
});

describe("the map, the list, the switch", () => {
  it("the rows in the home order, each place with its cards; \"+ here\" only for whoever manages; live in green", () => {
    const s = stateFromReply(200, reply([live(), row({ id: C2, name: "בסוף", slot: "end" })].map((c) => (typeof (c as any).content === "object" ? c : c)) as never));
    const out = screen(s);
    const rows = [...out.matchAll(/data-hs-map-row="([a-z_]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["top", "after_insights", "after_tiles", "after_main", "after_event", "after_holiday", "after_market", "after_weekly", "after_question", "after_happening", "after_progress", "end"]);
    expect(out).toMatch(new RegExp(`data-hs-zone="after_tiles"[\\s\\S]*?data-hs-zone-card="${C1}"`));
    expect(out).toMatch(new RegExp(`data-hs-zone="end"[\\s\\S]*?data-hs-zone-card="${C2}"`));
    expect(out.match(/data-hs-add="/g)).toHaveLength(12);
    const viewer = screen(s, false);
    expect(viewer).not.toContain("data-hs-add=");
    expect(viewer).not.toContain('data-hs-new=""');
    expect(viewer).toContain("הכרטיסים מוצגים במסך הבית");
    expect(viewer).not.toContain('data-toggle="hs-enabled"');
  });
  it("more than 2 shown now → the warning (687); 2 → none; the switch off says everything is hidden", () => {
    const three = stateFromReply(200, reply([row({ id: C1, status: "live", published_at: "2026-11-21T00:00:00Z" }), row({ id: C2, status: "live", published_at: "2026-11-21T00:00:00Z" }), row({ id: C3, status: "live", published_at: "2026-11-21T00:00:00Z" })]));
    expect(screen(three)).toContain("יש 3 כרטיסים שמוצגים עכשיו. במסך בית אחד מוצגים עד 2");
    const two = stateFromReply(200, reply([row({ id: C1, status: "live", published_at: "2026-11-21T00:00:00Z" }), row({ id: C2, status: "live", published_at: "2026-11-21T00:00:00Z" }), row({ id: C3, status: "live", published_at: "2026-11-21T00:00:00Z", ends_at: "2026-11-24T00:00:00Z" })]));
    expect(screen(two)).not.toContain("כרטיסים שמוצגים עכשיו");
    const off = screen(stateFromReply(200, reply([row()], { enabled: false })));
    expect(off).toContain('data-hs-switch="off"');
    expect(off).toContain("כרגע כל הכרטיסים מוסתרים");
  });
  it("a card row: status, validity, 7 days with the CTR (— without views), the actions by permission", () => {
    const r = html(createElement(CardRow, { c: live({ ends_at: endIso("2026-11-27") }), totals: { views: 40, taps: 6, closes: 2, swipes: 0, ends: 0 }, now: NOW, canManage: true, onEdit: () => {}, onStats: () => {}, onDuplicate: () => {}, busy: false }));
    expect(r).toContain("פורסם");
    expect(r).toContain("נגמר בעוד 2 ימים");
    expect(r).toMatch(/<b[^>]*>40<\/b> צפיות/);
    expect(r).toContain("15%");
    expect(r).toContain('data-hs-row-duplicate=""');
    const none = html(createElement(CardRow, { c: card(), totals: undefined, now: NOW, canManage: false, onEdit: () => {}, onStats: () => {}, onDuplicate: () => {}, busy: false }));
    expect(none).toContain("—");
    expect(none).not.toContain("data-hs-row-duplicate");
    expect(none).toContain("פתיחה");
  });
  it("the template picker: the 6 starters and an empty card; the place in the title", () => {
    const out = html(createElement(TemplatePicker, { slot: "after_market", onPick: () => {}, onClose: () => {} }));
    expect([...out.matchAll(/data-hs-template="([a-z_]+)"/g)].map((m) => m[1])).toEqual(["whats_new", "tip", "promo", "feature", "shortcuts", "stories", "blank"]);
    expect(out).toContain('כרטיס חדש אחרי &quot;חדש בלוח הקהילתי&quot;');
    expect(out).toContain("שום דבר לא מוצג עד שמפרסמים");
  });
  it("the list: the archive is not in \"all\" (it has its own filter)", () => {
    const out = screen(stateFromReply(200, reply([row(), row({ id: C2, status: "archived", name: "ישן" })])));
    expect(out).toContain(`data-hs-card="${C1}"`);
    expect(out).not.toContain(`data-hs-card="${C2}"`);
    expect(out).toMatch(/data-tab="archived"[^>]*>בארכיון<span[^>]*data-tab-count="1"/);
  });
  it("the map alone: an archived card is not on the map", () => {
    const out = html(createElement(HomeMap, { cards: [card({ status: "archived" })], now: NOW, canManage: true, onAdd: () => {}, onOpen: () => {} }));
    expect(out).not.toContain(`data-hs-zone-card="${C1}"`);
  });
});

describe("the editor", () => {
  const editor = (o: Partial<Parameters<typeof CardEditor>[0]> = {}) => html(createElement(CardEditor, {
    initial: formFromTemplate("tip", "after_happening", () => 0.42), card: null, updates: [update()], canManage: true, myEmail: "tal@bloc.co.il", now: NOW,
    onClose: () => {}, onChanged: () => {}, onRefresh: () => {}, ...o,
  }));
  it("the preview of what's new follows the editor's clock (the last 45 days of that day), not the computer's", () => {
    const f = formFromTemplate("whats_new", null, () => 0.42);
    const out = editor({ initial: f, updates: [update({ title: "עדכון מסוף 2025", published_at: "2025-12-30T08:00:00Z" })], now: new Date("2026-01-01T10:00:00Z") });
    expect(out).toContain("עדכון מסוף 2025");
  });
  it("a new card from a template: a draft to be; the shape picked; the phone shows it after the chosen row", () => {
    const out = editor();
    expect(out).toContain("כרטיס חדש במסך הבית");
    expect(out).toMatch(/data-hs-shape="banner"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-hs-shape="banner"/);
    expect(out).toContain('data-phone-slot="after_happening"');
    expect(out).toMatch(/data-phone-row="מה קורה בבניין"[\s\S]*data-phone-slot="after_happening"[\s\S]*data-phone-row="המדד והאתגר"/);
    expect(out).toContain('data-phone-card="banner"');
    expect(out).toContain("ידעתם?");
    expect(out).toContain('data-phone-cta=""');
    expect(out).toContain("שמירה כטיוטה");
    expect(out).toContain('data-hs-publish=""');
    expect(out).toContain('data-hs-test=""');
    expect(out).not.toContain("data-hs-editor-status");
  });
  it("view only: said, no actions bar, the fields locked", () => {
    const out = editor({ canManage: false, card: card(), initial: formFromCard(card()) });
    expect(out).toContain("צפייה בלבד");
    expect(out).not.toContain('data-sticky-bar="hs-editor-actions"');
    expect(out).toMatch(/<fieldset disabled=""/);
  });
  it("a live card: pause and archive, no test send; the save says it updates everyone at once (once changed)", () => {
    const c = live();
    const out = editor({ card: c, initial: formFromCard(c) });
    expect(out).toContain('data-hs-editor-status="live"');
    expect(out).toContain('data-hs-status="paused"');
    expect(out).toContain('data-hs-status="archived"');
    expect(out).not.toContain('data-hs-test=""');
    expect(out).not.toContain('data-hs-publish=""');
    expect(out).toContain(">נשמר<");
    const changed = editor({ card: c, initial: { ...formFromCard(c), name: "טיפ חדש" } });
    expect(changed).toContain("שמירה (מתעדכן מיד אצל כולם)");
  });
  it("a card in test: who sees it; archived: no save and no actions but back to draft", () => {
    const t = card({ status: "test", test_emails: ["tal@bloc.co.il"] });
    expect(editor({ card: t, initial: formFromCard(t) })).toContain("מוצג רק אצל: <bdi>tal@bloc.co.il</bdi>");
    const a = card({ status: "archived" });
    const out = editor({ card: a, initial: formFromCard(a) });
    expect(out).not.toContain('data-hs-save=""');
    expect(out).toContain('data-hs-status="draft"');
    expect(out).toMatch(/<fieldset disabled=""/);
  });
  it("whats new with no live update for the role → the phone says the card will not show; an ended window → publish off", () => {
    const f = formFromTemplate("whats_new", null, () => 0.42);
    const out = editor({ initial: f, updates: [update({ status: "draft" })] });
    expect(out).toContain("data-phone-note");
    expect(out).toContain("אין עדכון &quot;מה חדש&quot; שפורסם לקהל הזה");
    const ended = editor({ initial: { ...formFromCard(card()), end_day: "2026-11-24" }, card: card() });
    expect(ended).toContain('data-hs-ended=""');
    expect(ended).toMatch(/<button[^>]*disabled=""[^>]*data-hs-publish=""/);
  });
  it("the audience without the committee → the phone (as a committee member) says they will not see it", () => {
    const f = { ...formFromCard(card()), roles: ["tenant" as const] };
    // the role toggle starts on "tenant" — the card shows; the note appears only for an audience the role is not in
    expect(editor({ initial: f, card: card() })).not.toContain("data-phone-note");
    const onlyVaad = { ...f, roles: ["vaad" as const] };
    expect(editor({ initial: onlyVaad, card: card() })).toContain("דיירים לא בקהל של הכרטיס, ולכן לא יראו אותו.");
  });
});

describe("the phone — each shape like bloc", () => {
  const P = (o: Partial<PreviewCard>) => html(createElement(PhoneCard, { now: NOW, card: { shape: "banner", source: "manual", title: null, subtitle: null, style: "soft", dismiss: "until_closed", test: false, countdown_to: null, items: [], ...o } }));
  const item = (o: Record<string, unknown> = {}) => ({ id: "a1", title: "כותרת", body: "טקסט", image_url: null, image_alt: null, icon: "spark" as const, accent: "brand" as const, link: null, cta: null, badge: null, ...o });
  it("no items → nothing; image only → the image 2:1 with the X over it (and the countdown on it)", () => {
    expect(P({ items: [] })).toBe("");
    const out = P({ items: [item({ title: null, body: null, image_url: IMG, image_alt: "מבצע" })], countdown_to: endIso("2026-11-30") });
    expect(out).toContain("aspect-ratio:2 / 1");
    expect(out).toContain('alt="מבצע"');
    expect(out).toContain('data-phone-close="until_closed"');
    expect(out).toContain("נשארו עוד 5 ימים");
  });
  it("a square with an image and text, like bloc: a 2:1 image with the badge on it, one line of title, the button, no body (review #12)", () => {
    const out = P({ shape: "tile", items: [item({ id: "a1", image_url: IMG, title: "גינה", body: "גוף שלא נכנס", badge: "חדש", cta: "לפרטים", link: { kind: "route", path: "/events" } }), item({ id: "a2", body: "גוף שנשאר" })] });
    const [withImg, plain] = out.split('data-phone-item="a2"');
    expect(withImg).toContain("aspect-ratio:2 / 1");
    expect(withImg).not.toContain("aspect-ratio:16 / 9");
    expect(withImg).not.toContain("גוף שלא נכנס");
    expect(withImg).toContain("חדש");
    expect(plain).toContain("גוף שנשאר");
  });
  it("a solid banner: blue, white text; the X says until tomorrow when daily", () => {
    const out = P({ style: "solid", dismiss: "daily", items: [item({ cta: "לפרטים", link: { kind: "route", path: "/chat" } })] });
    expect(out).toContain("background:#1D4ED8");
    expect(out).toContain('aria-label="סגירה עד מחר"');
    expect(out).toContain("לפרטים");
  });
  it("tiles, carousel, list, circles, deck — each its own layout", () => {
    const two = [item({ id: "a1" }), item({ id: "a2", title: "שני" })];
    expect(P({ shape: "tile", items: two })).toContain("grid-template-columns:1fr 1fr");
    expect(P({ shape: "carousel", items: two })).toContain("width:168px");
    expect(P({ shape: "list", items: two })).toContain("border-top:1px solid #E6EAF0");
    const circles = P({ shape: "circles", items: two });
    expect(circles.match(/data-phone-circle="/g)).toHaveLength(2);
    expect(circles).toContain('aria-label="כותרת, פתיחה"');
    const deck = P({ shape: "deck", items: [...two, item({ id: "a3" })], title: "מה חדש ב-bloc" });
    expect(deck).toContain('data-phone-deck="0"');
    expect(deck).toContain('data-phone-top="a1"');
    expect(deck).toContain("rotate(-3.5deg)");
    expect(deck).toContain('aria-label="הכרטיס הבא"');
  });
  it("the frame: 390 / 320 wide; the card after its row; the emergency row last", () => {
    const f = html(createElement(PhoneFrame, { width: 320, slot: "end", children: createElement("i", { "data-x": "1" }) }));
    expect(f).toContain('data-phone="320"');
    expect(f).toMatch(/data-phone-row="המדד והאתגר"[\s\S]*data-phone-slot="end"[\s\S]*שורת החירום/);
  });
});

describe("stats and whats new", () => {
  it("the KPIs, the CTR, the deck depth; 30 bars, empty days drawn low", () => {
    const out = html(createElement(StatsView, { card: { shape: "deck", name: "x" }, today: "2026-11-25", days: [{ day: "2026-11-24", views: 10, taps: 2, closes: 1, swipes: 15, ends: 4 }] }));
    expect(out).toContain('data-kpi="ctr"');
    expect(out).toContain("20%");
    expect(out).toContain('data-kpi="depth"');
    expect(out).toContain("2.5");
    expect(out).toContain("40%");
    expect(out.match(/data-hs-bar="/g)).toHaveLength(30);
    expect(out).toContain("ספירות בלבד, בלי מי ראה או לחץ.");
    const banner = html(createElement(StatsView, { card: { shape: "banner", name: "x" }, today: "2026-11-25", days: [] }));
    expect(banner).not.toContain('data-kpi="depth"');
    expect(banner).toContain("—");
  });
  it("the updates list (status, for whom, published on) and the empty state; the editor shows the card as it will look", () => {
    const out = html(createElement(UpdatesPanel, { updates: [update(), update({ id: "d1000000-0000-4000-8000-000000000002", status: "archived", title: "ישן" })], canManage: true, onChanged: () => {}, onRefresh: () => {} }));
    expect(out).toContain(`data-hs-update="${U1}"`);
    expect(out).not.toContain("ישן");
    expect(out).toContain("פורסם ב-21/11/2026");
    expect(out).toContain('data-hs-new-update=""');
    expect(html(createElement(UpdatesPanel, { updates: [], canManage: false, onChanged: () => {}, onRefresh: () => {} }))).toContain("עוד אין עדכונים.");
    const ed = html(createElement(UpdateEditor, { update: update(), canManage: true, onClose: () => {}, onChanged: () => {}, onRefresh: () => {} }));
    expect(ed).toContain('data-hs-update-preview=""');
    expect(ed).toContain("לנסות עכשיו");
    expect(ed).toContain("חדש");
    expect(ed).toContain('data-hs-update-draft=""');
  });
});
