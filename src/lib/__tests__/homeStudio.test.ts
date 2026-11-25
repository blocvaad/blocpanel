// bloc HOME-STUDIO-1 (החלטות 684–694): lib/homeStudio — מה שמסך "מסך הבית" בפאנל עושה עם התשובות של bloc ועם הטופס.
//   • הקבועים — אותם ערכים מפורשים כמו בטסט של bloc (tests/lib/homeStudio.test.ts שם): צורה / מקום / מקור / סטטוס שמשתנה בצד
//     אחד — שני הטסטים נכשלים.
//   • parse*: רק מה שבצורה המוכרת; כרטיס שהפאנל לא מכיר — נספר (unknown), לא נבלע ולא מפיל את הרשימה.
//   • הטופס ↔ הכרטיס ↔ card.save; הימים בשעון ישראל (גם ביום שהשעון זז); הבדיקה בטופס = הכללים של bloc.
//   • תוקף, ספירה ל-2, מפה, סטטיסטיקה, תבניות, כשל → משפט, וסכמת הפעולות (strict).
import { describe, it, expect } from "vitest";
import {
  STUDIO_SHAPES, STUDIO_SLOTS, STUDIO_SOURCES, STUDIO_STATUSES, STUDIO_FREQUENCIES, STUDIO_ACCENTS, STUDIO_ICONS, STUDIO_ROUTES, HOME_MAP, SHAPE_INFO,
  LIMITS, CARD_TRANSITIONS, UPDATE_TRANSITIONS, STUDIO_PLANS, WHATS_NEW_SHAPES, STUDIO_TEMPLATES, STUDIO_CAP,
  itemCountOk, itemsRule, fitCount, safeHttpsUrl, parseLink, linkFromText, parseCard, parseUpdate, parseStudioList, parseStats, parseSwitchAnswer,
  parseCardAnswer, formFromCard, emptyForm, withShape, payloadOf, cardProblems, endedForm, validity, liveNow, liveCount, slotCards, countdownText,
  pct, statsSummary, fillDays, sumDays, updatePayload, updateProblems, updateFormOf, emptyUpdateForm, updateAsItem, previewOf, formFromTemplate,
  hsFailure, fieldText, formField, hsActionSchema, HS_ACTIONS, citiesOf, newItemId, startIso, endIso, lastDayOf, itemAlt,
  type StudioCard, type StudioUpdate, type CardForm,
} from "../homeStudio";
import { ADS_REFRESH_CODES } from "../adsUi";

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const IMG = `${BASE}studio/2026-11/1.png`;
const C1 = "c1000000-0000-4000-8000-000000000001";
const C2 = "c1000000-0000-4000-8000-000000000002";
const U1 = "d1000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-25T10:00:00Z");   // 25/11 12:00 in Israel

function row(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: C1, name: "באנר", shape: "banner", slot: "after_tiles", position: 0, source: "manual",
    content: { title: null, subtitle: null, style: "soft", countdown: false, items: [{ id: "a1", title: "שלום", body: null, image_url: null, image_alt: null, icon: "spark", accent: "brand", link: { kind: "route", path: "/chat" }, cta: "לצ'אט", badge: null }] },
    audience: { roles: ["tenant", "vaad"], cities: [], plans: [], new_days: null, rollout: 100 },
    starts_at: null, ends_at: null, frequency: "until_closed", status: "draft", test_emails: [], version: 1,
    created_by: "team@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: null, ...o,
  };
}
const card = (o: Record<string, unknown> = {}) => parseCard(row(o)) as StudioCard;
const upd = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: U1, title: "צ'אט חדש", body: "עכשיו אפשר לענות להודעה.", image_url: null, link: "/chat", roles: ["tenant", "vaad"], status: "live", version: 1,
  created_by: "team@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: "2026-11-21T00:00:00Z", ...o,
});

describe("the constants — the same explicit values as the bloc test", () => {
  it("shapes, slots, sources, statuses, frequencies, accents, icons, routes, limits, transitions", () => {
    expect([...STUDIO_SHAPES]).toEqual(["banner", "tile", "circles", "carousel", "list", "deck"]);
    expect([...STUDIO_SLOTS]).toEqual(["top", "after_insights", "after_tiles", "after_main", "after_event", "after_holiday", "after_market", "after_weekly", "after_question", "after_happening", "after_progress", "end"]);
    expect(HOME_MAP.map((r) => r.slot)).toEqual(STUDIO_SLOTS.slice(0, -1));
    expect([...STUDIO_SOURCES]).toEqual(["manual", "whats_new"]);
    expect([...WHATS_NEW_SHAPES]).toEqual(["deck", "list", "circles"]);
    expect([...STUDIO_STATUSES]).toEqual(["draft", "test", "live", "paused", "archived"]);
    expect([...STUDIO_FREQUENCIES]).toEqual(["until_closed", "daily"]);
    expect([...STUDIO_ACCENTS]).toEqual(["brand", "green", "amber", "pink", "indigo"]);
    expect(STUDIO_ICONS).toHaveLength(20);
    expect(STUDIO_ROUTES.map((r) => r.path)).toEqual(["/chat", "/marketplace", "/events", "/announcements", "/votes", "/services", "/payments", "/maintenance", "/documents", "/neighbors", "/health", "/building-knowledge", "/notifications", "/profile", "/settings", "/upgrade"]);
    expect(Object.fromEntries(STUDIO_SHAPES.map((s) => [s, [SHAPE_INFO[s].min, SHAPE_INFO[s].max]]))).toEqual({ banner: [1, 1], tile: [2, 4], circles: [2, 10], carousel: [2, 10], list: [2, 6], deck: [1, 8] });
    expect(LIMITS).toEqual({ name: 80, cardTitle: 40, cardSubtitle: 80, itemTitle: 60, itemBody: 160, itemAlt: 120, cta: 20, badge: 16, updateTitle: 60, updateBody: 240, testEmails: 5, cities: 30, city: 40, newDaysMax: 90 });
    expect(CARD_TRANSITIONS).toEqual({ draft: ["test", "live", "archived"], test: ["draft", "live", "archived"], live: ["paused", "archived"], paused: ["live", "draft", "archived"], archived: ["draft"] });
    expect(UPDATE_TRANSITIONS).toEqual({ draft: ["live", "archived"], live: ["draft", "archived"], archived: ["draft"] });
    expect(STUDIO_PLANS.map((p) => p.key)).toEqual(["free", "building", "large", "tower", "company"]);
    expect(STUDIO_CAP).toBe(2);
  });
  it("items per shape: a tile — 2 or 4 only; the rule as a sentence; fitting a count to a shape", () => {
    expect([1, 2, 3, 4, 5].map((n) => itemCountOk("tile", n))).toEqual([false, true, false, true, false]);
    expect([itemCountOk("banner", 1), itemCountOk("banner", 2), itemCountOk("deck", 8), itemCountOk("deck", 9)]).toEqual([true, false, true, false]);
    expect([itemsRule("tile"), itemsRule("banner"), itemsRule("list")]).toEqual(["2 או 4", "1", "2 עד 6"]);
    expect([fitCount("tile", 1), fitCount("tile", 3), fitCount("banner", 5), fitCount("carousel", 1), fitCount("list", 9)]).toEqual([2, 4, 1, 2, 6]);
  });
});

describe("links (693)", () => {
  it("https only, a host with a dot, no IP / localhost / credentials, up to 300", () => {
    expect(safeHttpsUrl("https://bloc.co.il/x")).toBe("https://bloc.co.il/x");
    for (const bad of ["http://bloc.co.il", "https://localhost/x", "https://10.0.0.1/", "https://u:p@bloc.co.il", "javascript:alert(1)", "https://bloc", `https://a.co/${"x".repeat(300)}`, "https://a .co"]) {
      expect([bad, safeHttpsUrl(bad)]).toEqual([bad, null]);
    }
    expect(parseLink({ kind: "route", path: "/chat" })).toEqual({ kind: "route", path: "/chat" });
    expect(parseLink({ kind: "route", path: "/admin" })).toBeNull();
    expect(parseLink({ kind: "url", url: "https://x.co" })).toEqual({ kind: "url", url: "https://x.co/" });
    expect(linkFromText("/events")).toEqual({ kind: "route", path: "/events" });
    expect(linkFromText("/nope")).toBeNull();
    expect(linkFromText("https://x.co/a")).toEqual({ kind: "url", url: "https://x.co/a" });
  });
});

describe("parsing what bloc answers", () => {
  it("a card: the known shape only (enums, uuid, version, dates); content and audience normalized", () => {
    const c = card();
    expect(c).toMatchObject({ id: C1, shape: "banner", content: { style: "soft", items: [{ id: "a1", link: { kind: "route", path: "/chat" }, cta: "לצ'אט" }] }, audience: { roles: ["tenant", "vaad"], rollout: 100 } });
    for (const bad of [{ shape: "square" }, { slot: "middle" }, { status: "deleted" }, { version: 0 }, { id: "x" }, { content: { items: [{ id: "BAD ID" }] } }, { audience: null }, { starts_at: "soon" }]) {
      expect([bad, parseCard(row(bad))]).toEqual([bad, null]);
    }
    expect(parseCard(row({ content: { items: [{ id: "a1", title: "x", icon: "rocket", accent: "neon" }] } }))?.content.items[0]).toMatchObject({ icon: null, accent: "brand" });
  });
  it("the list: a card the panel does not know is counted (unknown), the rest shown; totals by id; a bad top shape → null", () => {
    const l = parseStudioList({ ok: true, enabled: true, cards: [row(), row({ id: C2, shape: "hexagon" })], updates: [upd(), upd({ id: "x" })], totals: { [C1]: { views: 3, taps: 1, closes: 0, swipes: 0, ends: 0 }, bad: { views: 1 } } });
    expect(l).toMatchObject({ enabled: true, unknown: 2, totals: { [C1]: { views: 3, taps: 1 } } });
    expect(l!.cards.map((c) => c.id)).toEqual([C1]);
    expect(l!.updates.map((u) => u.id)).toEqual([U1]);
    // a valid-looking body without ok: true is not an answer; totals only under a card id
    expect(parseStudioList({ ok: false, enabled: true, cards: [], updates: [], totals: {} })).toBeNull();
    expect(parseStudioList({ ok: true, enabled: true, cards: [], updates: [], totals: { "not-an-id": { views: 1, taps: 0, closes: 0, swipes: 0, ends: 0 } } })?.totals).toEqual({});
    for (const bad of [{ ok: false }, { ok: true, enabled: "yes", cards: [], updates: [], totals: {} }, { ok: true, enabled: true, cards: {}, updates: [], totals: {} }, { ok: true, enabled: true, cards: [], updates: [] }]) {
      expect(parseStudioList(bad as never)).toBeNull();
    }
  });
  it("an update, the stats days, the switch, a card answer", () => {
    expect(parseUpdate(upd())).toMatchObject({ id: U1, link: "/chat", roles: ["tenant", "vaad"], status: "live" });
    expect(parseUpdate(upd({ status: "test" }))).toBeNull();
    expect(parseStats({ ok: true, days: [{ day: "2026-11-24", views: 4, taps: 1, closes: 0, swipes: 2, ends: 1 }] })).toEqual([{ day: "2026-11-24", views: 4, taps: 1, closes: 0, swipes: 2, ends: 1 }]);
    expect(parseStats({ ok: true, days: [{ day: "24/11", views: 4, taps: 1, closes: 0, swipes: 2, ends: 1 }] })).toBeNull();
    expect(parseStats({ ok: true, days: [{ day: "2026-11-24", views: -1, taps: 1, closes: 0, swipes: 2, ends: 1 }] })).toBeNull();
    expect(parseSwitchAnswer({ ok: true, enabled: false, changed: true })).toEqual({ enabled: false, changed: true });
    expect(parseSwitchAnswer({ ok: true, enabled: false })).toBeNull();
    expect(parseCardAnswer({ ok: true, card: row() })?.id).toBe(C1);
    expect(parseCardAnswer({ card: row() })).toBeNull();
  });
});

describe("the form", () => {
  it("card → form → card.save: the same content back (ids kept); new → no id/version", () => {
    const c = card({ starts_at: "2026-11-30T22:00:00.000Z", ends_at: "2026-12-10T22:00:00.000Z", content: { ...(row().content as object), countdown: true } });
    const f = formFromCard(c);
    expect([f.start_day, f.end_day]).toEqual(["2026-12-01", "2026-12-10"]);
    const p = payloadOf(f);
    expect(p).toMatchObject({ id: C1, version: 1, name: "באנר", shape: "banner", slot: "after_tiles", starts_at: "2026-11-30T22:00:00.000Z", ends_at: "2026-12-10T22:00:00.000Z" });
    expect((p.content as any).items).toEqual([{ id: "a1", title: "שלום", body: null, image_url: null, image_alt: null, icon: "spark", accent: "brand", link: { kind: "route", path: "/chat" }, cta: "לצ'אט", badge: null }]);
    expect((p.content as any).countdown).toBe(true);
    expect(payloadOf(emptyForm("end", () => "x1"))).not.toHaveProperty("id");
    // an alt text without an image is not sent (bloc keeps it only with an image)
    const noImg = payloadOf({ ...f, items: [{ ...f.items[0], image_url: "", image_alt: "תיאור" }] });
    expect((noImg.content as any).items[0].image_alt).toBeNull();
  });
  it("Israel days — from the start of the first day to the start of the day after the last (also when the clock moves)", () => {
    expect(startIso("2026-12-01")).toBe("2026-11-30T22:00:00.000Z");          // winter: UTC+2
    expect(endIso("2026-07-10")).toBe("2026-07-10T21:00:00.000Z");            // summer: UTC+3
    expect(endIso("2026-10-24")).toBe("2026-10-24T22:00:00.000Z");            // the clock moves back on 25/10/2026: the day after starts at UTC+2
    expect(lastDayOf("2026-12-10T22:00:00.000Z")).toBe("2026-12-10");
  });
  it("a whats_new card sends no items; the audience — cities split, numbers, rollout default 100", () => {
    const f: CardForm = { ...emptyForm("top", () => "x1"), name: "מה חדש", shape: "deck", source: "whats_new", cities: "תל אביב-יפו, חיפה,, תל אביב-יפו", new_days: "14", rollout: "" };
    const p = payloadOf(f);
    expect((p.content as any).items).toEqual([]);
    expect(p.audience).toEqual({ roles: ["tenant", "vaad"], cities: ["תל אביב-יפו", "חיפה"], plans: [], new_days: 14, rollout: 100 });
    expect(payloadOf({ ...f, new_days: "abc" }).audience).toMatchObject({ new_days: -1 });      // bloc refuses it (invalid, field audience.new_days)
    expect(citiesOf("רמת גן\nגבעתיים، חולון")).toEqual(["רמת גן", "גבעתיים", "חולון"]);
  });
  it("changing the shape fits the items: a banner → tiles 2; tiles 4 → banner keeps the first", () => {
    const ids = (t: string[]) => newItemId(t, () => 0.5);
    const f = withShape(emptyForm("top", () => "a1"), "tile", ids);
    expect(f.items).toHaveLength(2);
    expect(f.items[0].id).toBe("a1");
    const four = withShape({ ...f, items: [...f.items, ...withShape(f, "tile", ids).items.slice(0, 2).map((i, n) => ({ ...i, id: `z${n}` }))] }, "banner", ids);
    expect(four.items.map((i) => i.id)).toEqual(["a1"]);
  });
  it("new item ids: 8 letters / digits, never one already in the card; a stuck random source never loops forever", () => {
    let n = 0;
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const id = newItemId(["aaaaaaaa"], () => seq[n++ % seq.length]);
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(id).not.toBe("aaaaaaaa");
    expect(newItemId(["aaaaaaaa", "item1"], () => 0)).toBe("item2");
  });
});

describe("the checks in the form — the bloc rules (692, 693)", () => {
  const ok = (): CardForm => formFromCard(card());
  const fields = (f: CardForm) => cardProblems(f, BASE).map((p) => p.field);
  it("a valid card has no problems; a name is required", () => {
    expect(fields(ok())).toEqual([]);
    expect(fields({ ...ok(), name: " " })).toEqual(["name"]);
  });
  it("an item: an image or a title; a button needs a link; an image only from our bucket; a route from the list; https only", () => {
    const f = ok();
    const it0 = f.items[0];
    expect(fields({ ...f, items: [{ ...it0, title: "", image_url: "" }] })).toEqual(["items.0"]);
    expect(fields({ ...f, items: [{ ...it0, title: "", image_url: IMG }] })).toEqual([]);                    // image only — fine (692)
    expect(fields({ ...f, items: [{ ...it0, image_url: "https://evil.co/x.png" }] })).toEqual(["items.0.image_url"]);
    expect(fields({ ...f, items: [{ ...it0, link_kind: "none" }] })).toEqual(["items.0.cta"]);              // a button without a link
    expect(fields({ ...f, items: [{ ...it0, link_kind: "none", cta: "" }] })).toEqual([]);
    expect(fields({ ...f, items: [{ ...it0, link_kind: "route", route: "/admin" }] })).toEqual(["items.0.link"]);
    expect(fields({ ...f, items: [{ ...it0, link_kind: "url", url: "http://x.co" }] })).toEqual(["items.0.link"]);
    expect(fields({ ...f, items: [{ ...it0, title: "x".repeat(61) }] })).toEqual(["items.0.title"]);
  });
  it("the count per shape; whats_new only in the multi shapes; roles; numbers; the window", () => {
    expect(fields({ ...ok(), shape: "tile" })).toEqual(["items"]);
    expect(fields({ ...ok(), source: "whats_new", shape: "banner" })).toEqual(["shape"]);
    expect(fields({ ...ok(), source: "whats_new", shape: "deck" })).toEqual([]);
    expect(fields({ ...ok(), roles: [] })).toEqual(["roles"]);
    expect(fields({ ...ok(), new_days: "91" })).toEqual(["new_days"]);
    expect(fields({ ...ok(), rollout: "0" })).toEqual(["rollout"]);
    expect(fields({ ...ok(), start_day: "2026-12-05", end_day: "2026-12-04" })).toEqual(["window"]);
    expect(fields({ ...ok(), start_day: "2026-12-05", end_day: "2026-12-05" })).toEqual([]);              // one day — fine
    expect(endedForm({ end_day: "2026-11-24" }, NOW)).toBe(true);
    expect(endedForm({ end_day: "2026-11-25" }, NOW)).toBe(false);
  });
});

describe("validity, the cap, the map", () => {
  it("ended / starts on / ends today / tomorrow / in N days (Israel days)", () => {
    expect(validity({ starts_at: null, ends_at: "2026-11-25T09:00:00Z" }, NOW)).toEqual({ text: "הסתיים", tone: "muted" });
    expect(validity({ starts_at: "2026-12-01T22:00:00Z", ends_at: null }, NOW)).toEqual({ text: "מתחיל ב-02/12/2026", tone: "info" });
    expect(validity({ starts_at: null, ends_at: endIso("2026-11-25") }, NOW)?.text).toBe("נגמר היום");
    expect(validity({ starts_at: null, ends_at: endIso("2026-11-26") }, NOW)?.text).toBe("נגמר מחר");
    expect(validity({ starts_at: null, ends_at: endIso("2026-11-28") }, NOW)).toEqual({ text: "נגמר בעוד 3 ימים", tone: "wait" });
    expect(validity({ starts_at: null, ends_at: endIso("2026-12-10") }, NOW)).toEqual({ text: "נגמר בעוד 15 ימים", tone: "info" });
    expect(validity({ starts_at: null, ends_at: null }, NOW)).toBeNull();
    expect([countdownText(endIso("2026-11-25"), NOW), countdownText(endIso("2026-11-26"), NOW), countdownText(endIso("2026-11-27"), NOW), countdownText(endIso("2026-11-30"), NOW)])
      .toEqual(["היום האחרון", "נשאר עוד יום", "נשארו עוד יומיים", "נשארו עוד 5 ימים"]);
  });
  it("live now: published and inside the window; the count; a slot — without the archive, by position", () => {
    const cards = [card({ status: "live", published_at: "2026-11-20T00:00:00Z" }), card({ id: C2, status: "live", published_at: "2026-11-20T00:00:00Z", ends_at: "2026-11-24T00:00:00Z", position: 1 })];
    expect(liveNow(cards[0], NOW)).toBe(true);
    expect(liveCount([...cards, card({ id: "c1000000-0000-4000-8000-000000000003", status: "draft" })], NOW)).toBe(1);
    const s = slotCards([card({ position: 2 }), card({ id: C2, position: 1 }), card({ id: "c1000000-0000-4000-8000-000000000003", status: "archived" })], "after_tiles");
    expect(s.map((c) => c.id)).toEqual([C2, C1]);
  });
});

describe("stats (689)", () => {
  it("CTR, the deck depth and reaching the end; no views → — (never 0%)", () => {
    expect(pct(1, 3)).toBe("33.3%");
    expect(pct(0, 0)).toBe("—");
    expect(statsSummary({ views: 10, taps: 2, closes: 1, swipes: 15, ends: 4 }, "deck")).toEqual({ ctr: "20%", depth: "2.5", ended: "40%" });
    expect(statsSummary({ views: 10, taps: 2, closes: 1, swipes: 15, ends: 4 }, "banner")).toEqual({ ctr: "20%", depth: null, ended: null });
    expect(statsSummary({ views: 0, taps: 0, closes: 0, swipes: 0, ends: 0 }, "deck")).toEqual({ ctr: "—", depth: "—", ended: "—" });
  });
  it("30 Israel days with zeros where there is no row; the sum", () => {
    const days = [{ day: "2026-11-24", views: 4, taps: 1, closes: 0, swipes: 0, ends: 0 }, { day: "2026-10-01", views: 9, taps: 9, closes: 9, swipes: 9, ends: 9 }];
    const all = fillDays(days, "2026-11-25");
    expect(all).toHaveLength(30);
    expect(all[0].day).toBe("2026-10-27");
    expect(all[28]).toEqual(days[0]);
    expect(all[29]).toEqual({ day: "2026-11-25", views: 0, taps: 0, closes: 0, swipes: 0, ends: 0 });
    expect(sumDays(days)).toEqual({ views: 13, taps: 10, closes: 9, swipes: 9, ends: 9 });
  });
});

describe("whats new (updates)", () => {
  it("the form ↔ the update; the link as an object; the checks", () => {
    const u = parseUpdate(upd()) as StudioUpdate;
    const f = updateFormOf(u);
    expect(f).toMatchObject({ id: U1, link_kind: "route", route: "/chat" });
    expect(updatePayload(f)).toEqual({ id: U1, version: 1, title: "צ'אט חדש", body: "עכשיו אפשר לענות להודעה.", image_url: null, link: { kind: "route", path: "/chat" }, roles: ["tenant", "vaad"] });
    expect(updateProblems(emptyUpdateForm(), BASE).map((p) => p.field)).toEqual(["title", "body"]);
    expect(updateProblems({ ...f, roles: [], link_kind: "url", url: "nope" }, BASE).map((p) => p.field)).toEqual(["link", "roles"]);
  });
  it("as a card item — like bloc: the badge, the spark, and \"try now\" only with a link", () => {
    expect(updateAsItem(parseUpdate(upd()) as StudioUpdate)).toMatchObject({ id: "ud1000000000040008000000000000001", title: "צ'אט חדש", badge: "חדש", icon: "spark", cta: "לנסות עכשיו" });
    expect(updateAsItem(parseUpdate(upd({ link: null })) as StudioUpdate).cta).toBeNull();
  });
});

describe("the live preview model", () => {
  it("manual: the items with an image or a title; the role outside the audience → hidden 'audience'", () => {
    const f = formFromCard(card({ audience: { roles: ["tenant"] } }));
    expect(previewOf(f, [], "tenant", NOW)).toMatchObject({ hidden: null, card: { shape: "banner", items: [{ id: "a1" }] } });
    expect(previewOf(f, [], "vaad", NOW).hidden).toBe("audience");
    expect(previewOf({ ...f, items: [{ ...f.items[0], title: "" }] }, [], "tenant", NOW).hidden).toBe("empty");
    // a button without a link is not drawn (as in bloc: the form flags it, the phone never shows a dead button)
    expect(previewOf({ ...f, items: [{ ...f.items[0], link_kind: "none", cta: "לפרטים" }] }, [], "tenant", NOW).card.items[0].cta).toBeNull();
  });
  it("whats new: only live updates for the role, newest first, up to 8; none → hidden 'empty'", () => {
    const f: CardForm = { ...emptyForm("top", () => "x1"), shape: "deck", source: "whats_new" };
    const ups = [parseUpdate(upd()), parseUpdate(upd({ id: "d1000000-0000-4000-8000-000000000002", roles: ["vaad"], published_at: "2026-11-22T00:00:00Z" })), parseUpdate(upd({ id: "d1000000-0000-4000-8000-000000000003", status: "draft" }))] as StudioUpdate[];
    expect(previewOf(f, ups, "vaad", NOW).card.items.map((i) => i.title)).toEqual(["צ'אט חדש", "צ'אט חדש"]);
    // like bloc (review #11): only the last 45 days (Israel), and a list shows up to 6
    const old = parseUpdate(upd({ id: "d1000000-0000-4000-8000-000000000009", published_at: "2026-09-01T00:00:00Z" })) as StudioUpdate;
    expect(previewOf(f, [...ups, old], "vaad", NOW).card.items).toHaveLength(2);
    const many = Array.from({ length: 9 }, (_, k) => parseUpdate(upd({ id: `d1000000-0000-4000-8000-00000000010${k}`, published_at: `2026-11-1${k}T00:00:00Z` })) as StudioUpdate);
    expect(previewOf({ ...f, shape: "list" }, many, "tenant", NOW).card.items).toHaveLength(6);
    expect(previewOf(f, many, "tenant", NOW).card.items).toHaveLength(8);
    // newest first: the update published on 22/11 (only for the committee) before the one of 21/11
    expect(previewOf(f, ups, "vaad", NOW).card.items.map((i) => i.id)).toEqual(["ud1000000000040008000000000000002", "ud1000000000040008000000000000001"]);
    expect(previewOf(f, ups, "tenant", NOW).card.items).toHaveLength(1);
    expect(previewOf(f, [], "tenant", NOW).hidden).toBe("empty");
    expect(previewOf({ ...f, countdown: true, end_day: "2026-12-01" }, ups, "tenant", NOW).card.countdown_to).toBe(endIso("2026-12-01"));
    expect(itemAlt({ image_alt: null, title: null }, null)).toBe("פרסום של bloc");
  });
});

describe("the templates (694)", () => {
  it("6 starters; every one but the image-only (needs an upload) is valid as it is; the slot from \"+ here\" wins", () => {
    expect(STUDIO_TEMPLATES.map((t) => t.key)).toEqual(["whats_new", "tip", "promo", "feature", "shortcuts", "stories"]);
    for (const t of STUDIO_TEMPLATES) {
      let k = 0;
      const f = formFromTemplate(t.key, null, () => ((k++ * 7) % 36) / 36);
      const p = cardProblems(f, BASE).map((x) => x.field);
      expect([t.key, f.shape, p]).toEqual([t.key, t.shape, t.key === "promo" ? ["items.0", "items.0.link"] : []]);
      expect(new Set(f.items.map((i) => i.id)).size).toBe(f.items.length);
    }
    expect(formFromTemplate("tip", "end").slot).toBe("end");
    expect(formFromTemplate("tip", null).slot).toBe("after_main");
    expect(formFromTemplate(null, "after_market")).toMatchObject({ shape: "banner", slot: "after_market", items: [{ title: "" }] });
  });
});

describe("failures → the sentence the staff sees", () => {
  it("the bloc codes, with the field where it helps; maybe done → refresh; connection codes pass their own sentence", () => {
    const f = (code: string, status = 400, field?: string) => hsFailure({ status, error: code, code, data: field ? { field } : undefined }, "action");
    expect(f("item_empty", 400, "content.items.1")).toMatchObject({ status: 400, error: "פריט 2: צריך תמונה או כותרת.", field: "content.items.1" });
    expect(f("cta_without_link", 400, "content.items.0.cta").error).toBe("פריט 1: הכפתור: כפתור צריך קישור.");
    expect(f("changed", 409).error).toMatch(/מישהו אחר שמר/);
    expect(f("ended", 409).error).toMatch(/תאריך הסיום כבר עבר/);
    expect(f("sql_missing", 503).error).toMatch(/SQL 256/);
    expect(f("invalid", 400, "audience.new_days").error).toBe("משתמשים חדשים: הערך לא תקין.");
    expect(hsFailure({ status: 504, error: "x", code: "TIMEOUT" }, "action")).toMatchObject({ code: "TIMEOUT", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף לפני שמנסים שוב." });
    // a platform 500 / 504 with no code from bloc: still "unclear" (the editor locks; no second create) — review #4
    for (const st of [500, 502, 504]) expect(hsFailure({ status: st, error: "x" }, "action")).toMatchObject({ code: "unclear", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף לפני שמנסים שוב." });
    expect(ADS_REFRESH_CODES.has(hsFailure({ status: 500, error: "x" }, "action").code)).toBe(true);
    expect(hsFailure({ status: 503, error: "החיבור לא מוגדר", code: "NOT_CONFIGURED" }, "read")).toEqual({ status: 503, code: "NOT_CONFIGURED", error: "החיבור לא מוגדר" });
    expect(hsFailure({ status: 403, error: "forbidden", code: "forbidden" }, "read").error).toBe("אין הרשאה לנהל את מסך הבית.");
    expect([fieldText("content.items.2.image_alt"), fieldText("audience.roles"), fieldText("weird"), formField("content.items.0.cta"), formField("audience.roles")])
      .toEqual(["פריט 3: התיאור של התמונה", "למי", null, "items.0.cta", "roles"]);
  });
});

describe("the action schema (strict) and who may do what", () => {
  it("unknown action / field / bad enum → refused before bloc; reads vs writes", () => {
    expect(hsActionSchema.safeParse({ action: "card.stats", id: C1 }).success).toBe(true);
    expect(hsActionSchema.safeParse({ action: "card.stats", id: C1, x: 1 }).success).toBe(false);
    expect(hsActionSchema.safeParse({ action: "card.status", id: C1, version: 1, status: "deleted" }).success).toBe(false);
    expect(hsActionSchema.safeParse({ action: "list" }).success).toBe(false);
    expect(hsActionSchema.safeParse({ action: "image.upload_url", type: "image/png", bytes: 1 }).success).toBe(false);
    expect(hsActionSchema.safeParse({ action: "switch", enabled: "no" }).success).toBe(false);
    expect(hsActionSchema.safeParse({ action: "card.save", ...payloadOf(formFromCard(card())) }).success).toBe(true);
    expect(Object.entries(HS_ACTIONS).filter(([, v]) => v.permission === "home_studio.read").map(([k]) => k)).toEqual(["card.stats"]);
    expect(Object.values(HS_ACTIONS).filter((v) => v.audit).map((v) => v.audit)).toEqual(["HOME_CARD_SAVE", "HOME_CARD_DUPLICATE", "HOME_CARD_STATUS", "BLOC_UPDATE_SAVE", "BLOC_UPDATE_STATUS", "HOME_STUDIO_SWITCH"]);
  });
});
