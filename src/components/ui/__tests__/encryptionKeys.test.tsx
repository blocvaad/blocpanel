// KEYS-1 — the "מפתחות הצפנה" card on the security page, rendered on the server like the other panel card tests (no happy-dom,
// no testing-library in the panel): loading ≠ failed ≠ empty, the key state, the counts, the payment row without a button, and
// the two super-admin buttons — dry run, then re-encrypt only with a fresh dry run, a current key and a note.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EncryptionKeysCard, { EncryptionKeysView, type KeysViewProps } from "../EncryptionKeysCard";
import {
  makeDryRun, STALE_TEXT, ONLY_SUPERADMIN_TEXT, NEED_DRY_RUN_TEXT, NOTHING_TO_DO_TEXT, NOTE_REQUIRED_TEXT, DRY_RUN_TTL_MS, NO_TOKEN_TEXT,
  type KindStatus, type KeysStatus, type RunResult,
} from "@/lib/encryptionKeys";

const T0 = Date.parse("2026-11-15T09:00:00Z");
const counts = { rows: 40, legacy: 50, oldKid: 10, current: 20, unreadable: 0 };
const sb = (o: Partial<KindStatus> = {}): KindStatus => ({
  kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts: { ...counts }, ...o,
});
const status = (s: KindStatus = sb(), payment: KindStatus | null = null): KeysStatus => ({ supplierBank: s, payment });
// C5: a dry run carries bloc's signed token (synthetic signature); null = a dry run that came back without one
const TOKEN = `kd1.supplier_bank.k2.1763197200000.${("Zx9_-" + "a1B2c3D4e5".repeat(4)).slice(0, 43)}`;
const dryResult = (o: Partial<RunResult["counts"]> = {}, token: string | null = TOKEN): RunResult => ({
  kind: "supplier_bank", dryRun: true, counts: { scanned: 40, changed: 60, conflicts: 0, unreadable: 0, remaining: 3, ...o },
  ...(token ? { dryRunToken: token } : {}),
});
const base: KeysViewProps = {
  load: { phase: "ready", status: status(), checkedAt: "2026-11-15T09:00:00Z" },
  canAct: true, now: T0, dry: null, last: null, confirmOpen: false, note: "", noteError: null, busy: null, msg: null,
};
const html = (o: Partial<KeysViewProps> = {}) => renderToStaticMarkup(createElement(EncryptionKeysView, { ...base, ...o }));
const ready = (s: KindStatus, o: Partial<KeysViewProps> = {}) => html({ load: { phase: "ready", status: status(s), checkedAt: "2026-11-15T09:00:00Z" }, ...o });
/** the opening tag of the first element carrying `attr` */
const tag = (h: string, attr: string) => h.match(new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`))?.[0] ?? "";
const isDisabled = (h: string, attr: string) => / disabled=""/.test(tag(h, attr));
const paymentBlock = (h: string) => h.slice(h.indexOf('data-keys-kind="payment"'), h.indexOf("המפתחות נשמרים ב-Vercel"));

describe("three different states: loading, failed, empty", () => {
  it("the card itself starts loading (it fetches on mount) — busy, no numbers, no buttons but refresh", () => {
    const h = renderToStaticMarkup(createElement(EncryptionKeysCard, { canAct: true }));
    expect(h).toContain('data-keys-state="loading"');
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain("בודקים את מצב ההצפנה ב-bloc");
    expect(h).not.toContain("data-keys-kind");
    expect(h).not.toContain("data-keys-dry-run");
  });
  it("failed — an alert with the reason and 'try again'; no counts, no zeros", () => {
    const h = html({ load: { phase: "error", error: "bloc לא הצליח לקרוא את מצב ההצפנה, ולכן לא מוצגים מספרים (גם לא 0)." } });
    expect(h).toContain('data-keys-state="error"');
    expect(h).toContain('role="alert"');
    expect(h).toContain("bloc לא הצליח לקרוא את מצב ההצפנה");
    expect(h).toContain("data-keys-retry");
    expect(h).not.toContain('data-keys-stat="');
    expect(h).not.toContain("data-keys-kind");
  });
  it("failed because the panel session ended — a sign-in link instead of 'try again'", () => {
    const h = html({ load: { phase: "error", error: "ההתחברות לפאנל הסתיימה. התחברו מחדש.", login: true } });
    expect(h).toContain('href="/login"');
    expect(h).not.toContain("data-keys-retry");
  });
  it("empty — nothing stored yet: says so, no dry-run / re-encrypt buttons; new saves go to the current key", () => {
    const h = ready(sb({ counts: { rows: 0, legacy: 0, oldKid: 0, current: 0, unreadable: 0 } }));
    expect(h).toContain('data-keys-state="empty"');
    expect(h).toContain("אין עדיין פרטי בנק שמורים");
    expect(h).toMatch(/יוצפן\s*במפתח\s*<bdi dir="ltr"[^>]*data-kid="k2">k2<\/bdi>/);
    expect(h).not.toContain("data-keys-dry-run");
    expect(h).not.toContain("data-keys-reencrypt");
    expect(h).toContain('data-keys-kind="payment"');
  });
  it("empty without a key — new saves stay on the old key", () => {
    expect(ready(sb({ configured: false, valid: false, currentKid: null, kids: [], counts: { rows: 0, legacy: 0, oldKid: 0, current: 0, unreadable: 0 } })))
      .toContain("יוצפן במפתח הישן");
  });
  it("counts that did not arrive — said in words, no tiles (never a 0 in their place)", () => {
    const h = ready(sb({ counts: null }));
    expect(h).toContain('data-keys-state="ready"');
    expect(h).toContain("הספירה לא הגיעה מ-bloc");
    expect(h).not.toContain('data-keys-stat="');
  });
});

describe("the key and the counts", () => {
  it("current key: green tag with the kid, the readable kids as LTR chips, when it was checked", () => {
    const h = html();
    expect(h).toContain('data-keys-key-state="ok"');
    expect(h).toContain("מפתח נוכחי");
    expect(h).toMatch(/<bdi dir="ltr"[^>]*data-kid="k2">k2<\/bdi>/);
    expect(h).toMatch(/<bdi dir="ltr"[^>]*data-kid="k1">k1<\/bdi>/);
    expect(h).toContain("data-keys-checked");
    expect(h).not.toContain("data-keys-nokey");
  });
  it("the four counts and the share on the current key (current out of all values)", () => {
    const h = html();
    for (const [id, label, n] of [["legacy", "פורמט ישן", 50], ["oldKid", "מפתח קודם", 10], ["current", "מפתח נוכחי", 20], ["unreadable", "לא קריאים", 0]] as const) {
      const at = h.indexOf(`data-keys-stat="${id}"`);
      expect(at, id).toBeGreaterThan(-1);
      const tile = h.slice(at, h.indexOf("</div>", at));
      expect(tile).toContain(label);
      expect(tile).toContain(`>${n}</dd>`);
    }
    expect(h).toContain('data-keys-share="25"');
    expect(h).toContain('aria-valuenow="25"');
    expect(h).toContain("40 שורות");
  });
  it("no key set: amber tag, what happens meanwhile (old key, nothing breaks), both buttons closed with the reason", () => {
    const h = ready(sb({ configured: false, valid: false, currentKid: null, kids: [] }));
    expect(h).toContain('data-keys-key-state="wait"');
    expect(h).toContain("לא הוגדר מפתח");
    expect(h).toContain("ENCRYPTION_KEYS_SUPPLIER_BANK");
    expect(h).toContain("שום דבר לא נשבר");
    expect(h).toContain("אין (רק הפורמט הישן)");
    expect(isDisabled(h, "data-keys-dry-run")).toBe(true);
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(h).toContain("ייפתחו אחרי שמגדירים מפתח נוכחי");
    // no "% on the current key" without a current key; the rows still show
    expect(h).not.toContain("data-keys-share");
    expect(h).not.toContain('role="progressbar"');
    expect(h).toContain("40 שורות");
    // a closed button looks closed (grey), not a faded blue that looks clickable
    expect(tag(h, "data-keys-reencrypt")).toContain("background:var(--border)");
    expect(tag(h, "data-keys-dry-run")).toContain("color:var(--text-3)");
  });
  it("malformed setting: red tag and how to fix it", () => {
    const h = ready(sb({ valid: false, currentKid: null }));
    expect(h).toContain('data-keys-key-state="danger"');
    expect(h).toContain("הגדרה פגומה");
    expect(h).toContain("kid:64hex");
    expect(isDisabled(h, "data-keys-dry-run")).toBe(true);
  });
  it("unreadable values: a red warning that re-encryption leaves them alone", () => {
    const h = ready(sb({ counts: { ...counts, unreadable: 4 } }));
    expect(h).toContain("data-keys-unreadable");
    expect(h).toContain("4 ערכים לא נפתחים");
    expect(h).toContain("ההצפנה מחדש לא נוגעת בהם");
  });
});

describe("payment secrets — a row with no button", () => {
  it("stays on the old key until the owner moves his file; no button anywhere in the row", () => {
    const p = paymentBlock(html());
    expect(p).toContain("סודות הסליקה של הבניינים");
    expect(p).toContain("על המפתח הישן");
    expect(p).toContain("MESHULAM_ENCRYPTION_KEY");
    expect(p).toContain("עד שהבעלים מעביר את הקובץ שלו");
    expect(p).not.toContain("<button");
  });
  it("a new payment key already set is mentioned — still no button", () => {
    const h = html({ load: { phase: "ready", status: status(sb(), sb({ kind: "payment", currentKid: "p1", kids: ["p1"] })), checkedAt: "2026-11-15T09:00:00Z" } });
    const p = paymentBlock(h);
    expect(p).toContain("data-keys-payment-ready");
    expect(p).toContain('data-kid="p1"');
    expect(p).not.toContain("<button");
  });
});

describe("super-admin buttons: dry run, then re-encrypt", () => {
  it("no dry run yet: 'הרצת ניסיון' open, 'הצפנה מחדש' closed with the reason", () => {
    const h = html();
    expect(h).toContain("הרצת ניסיון");
    expect(isDisabled(h, "data-keys-dry-run")).toBe(false);
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(h).toContain(NEED_DRY_RUN_TEXT);
    expect(tag(h, "data-keys-reencrypt")).toContain('aria-describedby="keys-hint"');
  });
  it("a fresh dry run: shows what would change, and opens 'הצפנה מחדש'", () => {
    const dry = makeDryRun(dryResult(), sb(), T0);
    const h = html({ dry, now: T0 + 2 * 60_000 });
    expect(tag(h, "data-keys-dry=")).toContain('data-keys-dry-state="fresh"');
    expect(h).toContain("לפני 2 דקות");
    const panel = h.slice(h.indexOf("data-keys-dry="), h.indexOf("data-keys-kind=\"payment\""));
    expect(panel).toContain("ייכתבו מחדש");
    expect(panel).toContain(">60</dd>");
    expect(panel).toContain("יישארו אחרי הסבב");
    expect(panel).toContain(">3</dd>");
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(false);
    expect(tag(h, "data-keys-reencrypt")).toContain("background:var(--blue)");
    expect(h).not.toContain("data-keys-hint");
    // the confirmation opens only on click
    expect(h).not.toContain('role="alertdialog"');
    expect(h).not.toContain("data-keys-note=");
  });
  it("a dry run older than 10 minutes: marked stale, 'הצפנה מחדש' closed", () => {
    const h = html({ dry: makeDryRun(dryResult(), sb(), T0), now: T0 + DRY_RUN_TTL_MS + 1 });
    expect(tag(h, "data-keys-dry=")).toContain('data-keys-dry-state="stale_time"');
    expect(h).toContain("ישנה");
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(h).toContain(STALE_TEXT.stale_time);
  });
  it("the state changed since the dry run (counts / key): closed with the reason", () => {
    const dry = makeDryRun(dryResult(), sb(), T0);
    let h = ready(sb({ counts: { ...counts, legacy: 49, current: 21 } }), { dry, now: T0 });
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(h).toContain(STALE_TEXT.stale_counts);
    h = ready(sb({ currentKid: "k3", kids: ["k3", "k2", "k1"] }), { dry, now: T0 });
    expect(h).toContain(STALE_TEXT.stale_key);
  });
  it("a fresh dry run that came back without bloc's token: 'הצפנה מחדש' stays closed, with the reason; the token is never rendered", () => {
    const h = html({ dry: makeDryRun(dryResult({}, null), sb(), T0) });
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(h).toContain(NO_TOKEN_TEXT);
    expect(html({ dry: makeDryRun(dryResult(), sb(), T0), confirmOpen: true })).not.toContain(TOKEN);
  });
  it("a dry run that found nothing: says so, 'הצפנה מחדש' stays closed", () => {
    const h = html({ dry: makeDryRun(dryResult({ changed: 0, remaining: 0 }), sb(), T0) });
    expect(h).toContain("data-keys-dry-nothing");
    expect(h).toContain(NOTHING_TO_DO_TEXT);
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
  });
  it("while a request runs, every button waits", () => {
    const h = html({ dry: makeDryRun(dryResult(), sb(), T0), busy: "dry_run" });
    expect(h).toContain("מריצים ניסיון…");
    expect(isDisabled(h, "data-keys-dry-run")).toBe(true);
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);
    expect(isDisabled(h, "data-keys-refresh")).toBe(true);
  });
  it("not a super-admin: sees everything, no action buttons, and why", () => {
    const h = html({ canAct: false, dry: makeDryRun(dryResult(), sb(), T0) });
    expect(h).toContain(ONLY_SUPERADMIN_TEXT);
    expect(h).not.toContain("data-keys-dry-run");
    expect(h).not.toContain("data-keys-reencrypt");
    expect((h.match(/<button/g) ?? []).length).toBe(1);   // רק "רענון"
    expect(h).toContain('data-keys-stat="legacy"');
  });
});

describe("the confirmation: the dry-run counts and a note", () => {
  const dry = makeDryRun(dryResult({ changed: 60, unreadable: 2, remaining: 3 }), sb(), T0);
  it("asks with the numbers from the dry run and the key it writes with", () => {
    const h = html({ dry, confirmOpen: true, now: T0 + 60_000 });
    expect(h).toContain('role="alertdialog"');
    expect(h).toMatch(/להצפין מחדש 60 ערכים במפתח <bdi dir="ltr"[^>]*data-kid="k2">k2<\/bdi>\?/);
    const body = h.slice(h.indexOf("data-keys-confirm-counts"), h.indexOf("</p>", h.indexOf("data-keys-confirm-counts")));
    expect(body).toContain("לפני דקה");
    expect(body).toContain("60 ייכתבו מחדש");
    expect(body).toContain("2 לא קריאים יישארו כמו שהם");
    expect(body).toContain("3 יחכו לסבב הבא");
    expect(h).toContain("data-keys-note");
    expect(h).toContain("הערה (חובה, לפחות 10 תווים)");
    expect(h).toContain("לא מדביקים כאן מפתח");
    expect(isDisabled(h, "data-keys-confirm-go")).toBe(false);
    expect(isDisabled(h, "data-keys-reencrypt")).toBe(true);   // הכפתור שפתח את החלון — לא פעמיים
  });
  it("a note error shows as an alert under the field", () => {
    const h = html({ dry, confirmOpen: true, note: "קצר", noteError: NOTE_REQUIRED_TEXT });
    expect(h).toContain("data-keys-note-error");
    expect(h).toContain(NOTE_REQUIRED_TEXT);
    expect(tag(h, "data-keys-note=")).toContain('aria-invalid="true"');
  });
  it("the dry run went stale while the window was open: the confirm button closes, with the reason", () => {
    const h = html({ dry, confirmOpen: true, now: T0 + DRY_RUN_TTL_MS + 1 });
    expect(isDisabled(h, "data-keys-confirm-go")).toBe(true);
    expect(h).toContain("data-keys-confirm-block");
    expect(h).toContain(STALE_TEXT.stale_time);
  });
  it("while the batch runs: 'מצפינים מחדש…', nothing can be clicked", () => {
    const h = html({ dry, confirmOpen: true, busy: "reencrypt", note: "הוגדר k2 ב-Vercel" });
    expect(h).toContain("מצפינים מחדש…");
    expect(isDisabled(h, "data-keys-confirm-go")).toBe(true);
    expect(isDisabled(h, "data-keys-confirm-cancel")).toBe(true);
  });
});

describe("after a batch", () => {
  const last = (o: Partial<RunResult["counts"]>) => ({ kind: "supplier_bank" as const, dryRun: false, at: T0, counts: { scanned: 200, changed: 198, conflicts: 2, unreadable: 0, remaining: 120, ...o } });
  it("more remain: the counts, and 'run a dry run and another batch'", () => {
    const h = html({ last: last({}) });
    expect(h).toContain("הסבב הסתיים");
    expect(h).toContain("הוצפנו מחדש");
    expect(h).toContain(">198</dd>");
    expect(h).toContain("נשארו 120 ערכים — מריצים ניסיון וסבב נוסף");
    expect(h).toContain("data-keys-last-conflicts");
    expect(h).toContain("ולכן לא נדרס");
  });
  it("nothing remains: done", () => {
    const h = html({ last: last({ remaining: 0, conflicts: 0 }) });
    expect(h).toContain("data-keys-last-done");
    expect(h).toContain("סיימנו");
    expect(h).not.toContain("data-keys-last-conflicts");
  });
  it("the batch ran but the status reload after it failed: the load error AND the batch result (review P3)", () => {
    const h = html({ load: { phase: "error", error: "bloc לא הצליח לקרוא את מצב ההצפנה" }, last: last({}), msg: null });
    expect(h).toContain('data-keys-state="error"');
    expect(h).toContain("bloc לא הצליח לקרוא את מצב ההצפנה");
    expect(h).toContain("data-keys-last");
    expect(h).toContain("הסבב הסתיים");
    expect(h).toContain(">198</dd>");
    expect(h).toContain("נשארו 120 ערכים");
    // once, not twice, and the card's other blocks stay hidden
    expect((h.match(/data-keys-last=""/g) ?? []).length).toBe(1);
    expect(h).not.toContain("data-keys-kind");
    expect((html({ last: last({}) }).match(/data-keys-last=""/g) ?? []).length).toBe(1);
  });
  it("still loading after a batch (no result yet to lose) — nothing extra shows", () => {
    expect(html({ load: { phase: "loading" }, last: null })).not.toContain("data-keys-last");
  });
});

describe("messages", () => {
  it("success is a status line; a failure is an alert; an ended session offers sign-in", () => {
    expect(html({ msg: { ok: true, text: "ריצת הניסיון הסתיימה. שום דבר לא שונה." } })).toMatch(/role="status" data-keys-msg="ok"/);
    const e = html({ msg: { ok: false, text: "אין מפתח נוכחי לפרטי הבנק של הספקים" } });
    expect(e).toContain('data-keys-msg="error"');
    expect(e).toContain('role="alert"');
    expect(html({ msg: { ok: false, text: "ההתחברות לפאנל הסתיימה. התחברו מחדש.", login: true } })).toContain('href="/login"');
  });
  it("the message sits under the supplier-bank block; a failed batch stays visible even when the reload after it failed", () => {
    const h = html({ msg: { ok: true, text: "ריצת הניסיון הסתיימה. שום דבר לא שונה." } });
    expect(h.indexOf("data-keys-msg")).toBeLessThan(h.indexOf('data-keys-kind="payment"'));
    const e = html({ load: { phase: "error", error: "לא הצלחנו לטעון" }, msg: { ok: false, text: "הסבב נעצר באמצע" } });
    expect(e).toContain("הסבב נעצר באמצע");
    expect(e).toContain("לא הצלחנו לטעון");
  });
  it("the card says the keys never reach the panel and every run is logged", () => {
    const h = html();
    expect(h).toContain("המפתחות נשמרים ב-Vercel של bloc ולא מגיעים לפאנל");
    expect(h).toContain("כל ריצה, גם ניסיון, נרשמת ביומן");
  });
});
