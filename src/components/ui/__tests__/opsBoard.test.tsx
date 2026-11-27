// bloc OPS-1 (שלב 9, החלטות 752–755): מרכז התפעול — מצויר בשרת עם הצורה ש-/api/ops מחזיר (כמו שאר בדיקות הכרטיסים בפאנל).
//   • השורה העליונה: הכל תקין / כמה לא תקינים וכמה לבדוק; snapshot שלא נטען — "לא נטען" עם הסיבה, לא "תקין".
//   • "דורש תשומת לב": פריט עם ספר הפעלה ו"פתיחת תקלה" (רק למי שמנהל); המשימות, הגיבוי ותרגול השחזור, התורים; היומן.
//   • כשל ביומן — "היומן לא נטען" (לא "אין תקלות"); צופה — בלי כפתורי ניהול.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsBoardView, OpsSheet, type OpsBoardViewProps } from "../OpsBoard";
import type { OpsResponse, OpsSnapshot } from "@/lib/ops";

const NOW = Date.parse("2026-11-26T09:00:00Z");
const SNAP: OpsSnapshot = {
  generated_at: "2026-11-26T08:59:00Z",
  overall: "down",
  counts: { ok: 0, warn: 2, down: 1, unknown: 0 },
  items: [
    { key: "cron:backup", area: "jobs", level: "down", title: "הגיבוי הלילי", detail: "הריצה האחרונה נכשלה: timeout", at: "2026-11-24T03:00:00Z", count: null, playbook: "cron-failed", href: "/ops" },
    { key: "queue:content_reports", area: "queues", level: "warn", title: "דיווחים על תוכן", detail: "4 בתור · הראשון מחכה 30 שעות", at: "2026-11-25T03:00:00Z", count: 4, playbook: "queue-moderation", href: "/content-reports" },
    { key: "drill:last", area: "backup", level: "warn", title: "תרגול שחזור", detail: "עוד לא נעשה תרגול שחזור", at: null, count: null, playbook: "restore-drill", href: "/ops" },
  ],
  jobs: [
    { job: "backup", label: "הגיבוי הלילי", schedule: "0 3 * * *", critical: true, level: "down", last_success: "2026-11-24T03:01:00Z", last_failure: "2026-11-26T03:00:30Z", last_error: "timeout", week: { ok: 5, failed: 2 }, last_duration_ms: 120000 },
    { job: "payment-reminders", label: "תזכורות תשלום", schedule: "0 7 * * *", critical: true, level: "ok", last_success: "2026-11-26T07:00:20Z", last_failure: null, last_error: null, week: { ok: 7, failed: 0 }, last_duration_ms: 4000 },
  ],
  backup: { level: "down", configured: true, last_success: "2026-11-24T03:01:00Z", tables: 92, rows: 18204, bytes: 9_800_000, failed_tables: ["payments"], week: { ok: 5, failed: 2 }, drill: null },
  queues: [
    { key: "content_reports", title: "דיווחים על תוכן", count: 4, oldest: "2026-11-25T03:00:00Z", level: "warn", href: "/content-reports" },
    { key: "dm_reports", title: "דיווחים על הודעות פרטיות", count: 0, oldest: null, level: "ok", href: "/dm-reports" },
    { key: "webhook_failures", title: "כשלי webhook של תשלומים (24 שעות)", count: null, oldest: null, level: "unknown", href: "/payments" },
  ],
  failed: ["queue:webhook_failures"],
};
const I1 = "11111111-1111-4111-8111-111111111111";
const DATA: OpsResponse = {
  snapshot: SNAP, snapshotError: null,
  incidents: [
    { id: I1, title: "הגיבוי לא רץ", severity: "p1", status: "monitoring", playbook: "backup-failed", source: "cron:backup", summary: "הטוקן פג",
      opened_by_email: "tal@bloc.co.il", opened_at: "2026-11-26T06:00:00Z", updated_at: "2026-11-26T07:00:00Z", resolved_at: null, resolved_by_email: null },
    { id: "22222222-2222-4222-8222-222222222222", title: "מיילים לא יצאו", severity: "p2", status: "resolved", playbook: "email-down", source: null, summary: "הדומיין אומת",
      opened_by_email: "tal@bloc.co.il", opened_at: "2026-11-20T06:00:00Z", updated_at: "2026-11-20T09:00:00Z", resolved_at: "2026-11-20T09:00:00Z", resolved_by_email: "tal@bloc.co.il" },
  ],
  updates: [{ id: 1, incident_id: I1, at: "2026-11-26T07:00:00Z", by_email: "tal@bloc.co.il", status: "monitoring", note: "החלפתי טוקן, מחכה לריצה" }],
  drills: [],
  canManage: true,
};
const base: OpsBoardViewProps = { data: DATA, loadError: null, loading: false, now: NOW, onRefresh: () => {}, onSheet: () => {} };
const html = (o: Partial<OpsBoardViewProps> = {}) => renderToStaticMarkup(createElement(OpsBoardView, { ...base, ...o }));

describe("the operations board", () => {
  it("the top line: how many are down and how many to check, and when it was checked", () => {
    const h = html();
    expect(h).toContain('data-ops-overall="down"');
    expect(h).toContain("1 לא תקינים · 2 לבדוק");
    expect(h).toContain("נבדק לפני דקה");
  });
  it("all fine — one line", () => {
    const h = html({ data: { ...DATA, snapshot: { ...SNAP, overall: "ok", counts: { ok: 0, warn: 0, down: 0, unknown: 0 }, items: [] } } });
    expect(h).toContain("הכל תקין");
    expect(h).not.toContain('data-ops-section="attention"');
  });
  it("attention items: what happened, the playbook, 'open an incident' for managers, and a link to the screen", () => {
    const h = html();
    expect(h).toContain('data-ops-item="cron:backup"');
    expect(h).toContain("הריצה האחרונה נכשלה: timeout");
    // a job's time is its last success, said so
    expect(h).toContain("הריצה האחרונה נכשלה: timeout · הצליחה לאחרונה לפני יומיים");
    expect(h).toContain('data-ops-item-playbook="cron-failed"');
    expect(h).toContain('data-ops-item-open="queue:content_reports"');
    expect(h).toContain('href="/content-reports"');
  });
  it("an item that already has an open incident (same source) links to it — no second 'open an incident' (the server would refuse)", () => {
    const h = html();
    expect(h).not.toContain('data-ops-item-open="cron:backup"');
    expect(h).toContain(`data-ops-item-incident="${I1}"`);
    expect(h).toContain(`href="#incident-${I1}"`);
    expect(h).toContain("תקלה במעקב");
    expect(h).toContain(`id="incident-${I1}"`);
    // once it is resolved — "open an incident" again
    const resolved = html({ data: { ...DATA, incidents: DATA.incidents!.map((i) => ({ ...i, status: "resolved" as const })) } });
    expect(resolved).toContain('data-ops-item-open="cron:backup"');
  });
  it("the jobs, the backup (tables, rows, size, failed tables) and the last drill (none yet)", () => {
    const h = html();
    expect(h).toContain('data-ops-job="backup"');
    expect(h).toContain("7 ימים: 5 ✓ 2 ✗");
    expect(h).toContain("· timeout");
    expect(h).toContain("18,204");
    expect(h).toContain("9.3 MB");
    expect(h).toContain('data-ops-backup-failed=""');
    expect(h).toContain("נכשלו: payments");
    expect(h).toContain('data-ops-drill-last="none"');
    expect(h).toContain('data-ops-drill-new=""');
  });
  it("queues: a count with the oldest, empty, and not loaded (never 0)", () => {
    const h = html();
    const q = (k: string) => h.slice(h.indexOf(`data-ops-queue="${k}"`), h.indexOf("</li>", h.indexOf(`data-ops-queue="${k}"`)));
    expect(q("content_reports")).toContain("4 · הראשון");
    expect(q("dm_reports")).toContain("ריק");
    expect(q("webhook_failures")).toContain("לא נטען");
  });
  it("the journal: the open incident with its timeline and buttons; the closed one folded", () => {
    const h = html();
    expect(h).toContain(`data-ops-incident="${I1}"`);
    expect(h).toContain("במעקב");
    expect(h).toContain("החלפתי טוקן, מחכה לריצה");
    expect(h).toContain(`data-ops-incident-update="${I1}"`);
    expect(h).toContain(`data-ops-incident-resolve="${I1}"`);
    expect(h).toContain("נסגרו לאחרונה (1)");
    expect(h).toContain("הדומיין אומת");
  });
  it("a viewer sees everything but no manage buttons", () => {
    const h = html({ data: { ...DATA, canManage: false } });
    expect(h).toContain('data-ops-item="cron:backup"');
    for (const a of ["data-ops-item-open", "data-ops-incident-new", "data-ops-incident-update", "data-ops-incident-resolve", "data-ops-drill-new"]) expect(h).not.toContain(a);
  });
  it("the snapshot did not load — the reason, not 'fine'; the journal still shows", () => {
    const h = html({ data: { ...DATA, snapshot: null, snapshotError: "החיבור ל-bloc לא מוגדר" } });
    expect(h).toContain("מצב התפעול לא נטען מ-bloc — החיבור ל-bloc לא מוגדר");
    expect(h).not.toContain("הכל תקין");
    expect(h).toContain(`data-ops-incident="${I1}"`);
  });
  it("the journal did not load — 'not loaded', not 'no incidents'", () => {
    const h = html({ data: { ...DATA, incidents: null, updates: [] } });
    expect(h).toContain('data-ops-incidents-failed=""');
    expect(h).not.toContain('data-ops-incidents-empty');
  });
  it("nothing loaded yet with an error — the alert", () => {
    const h = html({ data: null, loadError: "מרכז התפעול לא נטען" });
    expect(h).toContain('data-ops-load-error=""');
  });
  it("time words: a minute, an hour, two hours, two days", async () => {
    const { agoLabel } = await import("@/lib/ops");
    const at = (s: number) => new Date(NOW - s * 1000).toISOString();
    expect(agoLabel(at(30), NOW)).toBe("ממש עכשיו");
    expect(agoLabel(at(90), NOW)).toBe("לפני דקה");
    expect(agoLabel(at(600), NOW)).toBe("לפני 10 דקות");
    expect(agoLabel(at(3700), NOW)).toBe("לפני שעה");
    expect(agoLabel(at(7300), NOW)).toBe("לפני שעתיים");
    expect(agoLabel(at(30 * 3600), NOW)).toBe("לפני 30 שעות");
    expect(agoLabel(at(50 * 3600), NOW)).toBe("לפני יומיים");
    expect(agoLabel(at(5 * 86400), NOW)).toBe("לפני 5 ימים");
    expect(agoLabel(null, NOW)).toBe("—");
  });
  it("every playbook is listed", () => {
    const h = html();
    for (const k of ["cron-failed", "backup-failed", "restore-drill", "data-exposure", "account-takeover"]) expect(h).toContain(`data-ops-playbook="${k}"`);
  });
});

describe("the sheets", () => {
  const sheet = (s: any, canManage = true) => renderToStaticMarkup(createElement(OpsSheet, { sheet: s, onClose: () => {}, onDone: () => {}, canManage, onOpenFromPlaybook: () => {} }));
  it("a playbook: when, impact, steps, check, who to tell; 'open an incident' only for managers", () => {
    const h = sheet({ kind: "playbook", key: "backup-failed" });
    expect(h).toContain('data-ops-playbook-view="backup-failed"');
    expect(h).toContain("מתי:");
    expect(h).toContain("הדקות הראשונות");
    expect(h).toContain("איך יודעים שנפתר");
    expect(h).toContain('data-ops-playbook-open=""');
    expect(sheet({ kind: "playbook", key: "backup-failed" }, false)).not.toContain("data-ops-playbook-open");
  });
  it("a new incident from an item: the title and the playbook's severity prefilled", () => {
    const h = sheet({ kind: "open", title: "הגיבוי הלילי: נכשל", severity: "p1", playbook: "backup-failed", source: "cron:backup" });
    expect(h).toContain('value="הגיבוי הלילי: נכשל"');
    expect(h).toMatch(/<option value="p1" selected="">/);
    expect(h).toContain("ספר הפעלה: הגיבוי הלילי נכשל או לא מוגדר");
  });
  it("a drill: yesterday's backup date, verify and passed by default, the command", () => {
    const h = sheet({ kind: "drill" });
    expect(h).toContain('data-ops-form-date=""');
    expect(h).toContain("--verify");
    expect(h).toMatch(/<option value="passed" selected="">/);
  });
});
