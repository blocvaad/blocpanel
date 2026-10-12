// src/app/api/broadcast/route.ts — הודעות של צוות bloc לבניינים (bloc UI-R5a).
//
// קודם: הפאנל כתב ישירות ל-DB — הודעה "קבועה" כברירת מחדל, בשם חבר הוועד הראשון שנמצא במערכת, גם
// לבניינים מושעים / בארכיון, התראה עם אימוג'י ובלי Push, עדיפויות עם שמות הפוכים — ובלי שום דרך להוריד.
// עכשיו:
//   GET    — מה נשלח (שנה אחורה): מקובץ לשידורים (lib/broadcasts), למי, עד מתי, מי ראה ומי אישר, ומי שלח.
//   POST   — שליחה דרך bloc (/api/internal/broadcast, חתום): "צוות bloc", רק בניינים פעילים, Push לפי
//            ההעדפות. מזהה שידור מהמסך — שליחה חוזרת / המשך לא שולחים פעמיים; מה שלא הספיק — ממשיכים כאן
//            (וגם המסך ממשיך עם remaining).
//   PATCH  — הורדה עכשיו / עריכה / תוקף (broadcast.manage).
//   DELETE — מחיקה, עם ההתראות שהובילו להודעה (סופר-אדמין).
// כל פעולה נרשמת ביומן הפאנל (BROADCAST*), גם כשנכשלה.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { fetchAll } from "@/lib/fetchAll";
import { callBloc, blocConfig } from "@/lib/blocApi";
import { parseBody, broadcastSchema, broadcastManageSchema, broadcastDeleteSchema } from "@/lib/validation";
import {
  completeGroups, expiryFor, expiryProblem, groupBroadcasts, hasBlanks,
  type BroadcastRow, type DurationKey,
} from "@/lib/broadcasts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86_400_000;
/** כמה אחורה הרשימה מגיעה, וכמה שידורים מוצגים. */
const HISTORY_DAYS = 365;
const MAX_GROUPS = 100;
/** המשך שליחה בתוך אותה בקשה — סבב חדש מתחיל רק עד כאן (סבב: עד ~15 שניות ב-bloc, ועד 25 עם הרשת),
 *  כדי שהבקשה תסתיים לפני maxDuration (60). מה שנשאר — המסך ממשיך. */
const RESUME_BUDGET_MS = 20_000;
/** כמה שורות לכל היותר נקראות לרשימה (השורה = הודעה בבניין אחד). */
const MAX_ROWS_PAGES = 30;
/** כשהקריאה נחתכה: שידור שהשורות שלו קרובות לנקודת החיתוך אולי חלקי — לא מוצג (מספרים ופעולות שגויים). */
const TRUNCATION_MARGIN_MS = 60 * 60_000;

type Row = Record<string, any>;
const ip = (req: Request) => req.headers.get("x-forwarded-for") ?? undefined;
const actorOf = (s: { id: string; email: string; role: string }) => ({ id: s.id, email: s.email, role: s.role });
const noStore = { "Cache-Control": "no-store" };

/** הקוד הסגור של expiryFor → מה לא בסדר. */
function resolveExpiry(b: { duration?: DurationKey; date?: string; expires_at?: string | null }): { ok: true; value: string | null } | { ok: false; error: string } {
  if (b.duration !== undefined) {
    const v = expiryFor(b.duration, b.date);
    if (v === undefined) return { ok: false, error: b.duration === "date" ? "בחרו תאריך מהיום ועד שנה קדימה" : "תאריך הסיום לא תקין" };
    return { ok: true, value: v };
  }
  const problem = expiryProblem(b.expires_at);
  return problem ? { ok: false, error: problem } : { ok: true, value: b.expires_at ?? null };
}

// ── הרשימה ──────────────────────────────────────────────────────────────────

export async function GET() {
  const g = await guard({ permission: "broadcast.send" });
  if (!g.ok) return g.response;
  const now = Date.now();
  const since = new Date(now - HISTORY_DAYS * DAY).toISOString();

  const COLS = "id, building_id, title, priority, is_pinned, requires_ack, expires_at, created_at, dedupe_key";
  const read = (cols: string) => fetchAll<BroadcastRow>((from, to) => adminClient.from("announcements").select(cols)
    .eq("is_system", true).gte("created_at", since)
    .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to) as any, { maxPages: MAX_ROWS_PAGES });
  let rowsRes = await read(COLS);
  let ackKnown = true;
  if (rowsRes.error) {
    // לפני 170 של bloc אין requires_ack — הרשימה עובדת בלי "בקשת אישור".
    rowsRes = await read(COLS.replace(", requires_ack", ""));
    ackKnown = false;
  }
  if (rowsRes.error) return NextResponse.json({ error: "טעינת ההודעות שנשלחו נכשלה. נסו לרענן." }, { status: 500 });

  const grouped = groupBroadcasts(rowsRes.rows, now);
  const all = rowsRes.truncated
    ? completeGroups(grouped, rowsRes.rows.at(-1)?.created_at ?? null, TRUNCATION_MARGIN_MS)
    : grouped;
  // קודם כל מה שעוד מוצג, ואז האחרונות שהסתיימו.
  const shown = [...all.filter((x) => x.state !== "ended"), ...all.filter((x) => x.state === "ended")].slice(0, MAX_GROUPS)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const buildingIds = [...new Set(shown.flatMap((x) => x.buildingIds))];
  const allIds = shown.flatMap((x) => x.ids);
  const broadcastIds = shown.map((x) => x.broadcastId).filter((x): x is string => !!x);

  const [contentR, namesR, countsR, membersR, auditR, legacyAuditR] = await Promise.all([
    shown.length ? adminClient.from("announcements").select("id, content").in("id", shown.map((x) => x.rep)) : null,
    chunked(buildingIds, 200, (part) => adminClient.from("buildings").select("id, name, is_active, is_archived").in("id", part)),
    chunked(allIds, 500, (part) => adminClient.rpc("announcement_read_counts", { p_ids: part })),
    // מתוך הדיירים — הוועד הוא צוות הבניין (לא מאשר ולא נספר, כמו ב-bloc).
    chunked(buildingIds, 100, async (part) => {
      const r = await fetchAll<Row>((from, to) => adminClient.from("building_memberships").select("building_id")
        .eq("status", "active").eq("role", "tenant").in("building_id", part).order("building_id").range(from, to) as any);
      return { data: r.rows, error: r.error || r.truncated ? { message: "members" } : null };
    }),
    // מי שלח — לפי מזהה השידור; שידור ישן (בלי מזהה ביומן) — לפי הכותרת וזמן השליחה.
    chunked(broadcastIds, 200, (part) => adminClient.from("panel_audit_logs").select("entity_id, admin_email, created_at")
      .eq("action", "BROADCAST").in("entity_id", part).order("created_at", { ascending: true })),
    shown.some((x) => x.legacy)
      ? adminClient.from("panel_audit_logs").select("admin_email, metadata, created_at")
        .eq("action", "BROADCAST").is("entity_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1000)
      : null,
  ]);
  // תוכן ושמות — בלעדיהם הרשימה הייתה נראית אמיתית ("בניין שנמחק", הודעה ריקה). כשל — כשל.
  if (contentR?.error || namesR.error) return NextResponse.json({ error: "טעינת ההודעות שנשלחו נכשלה. נסו לרענן." }, { status: 500 });

  const content = new Map<string, string>(((contentR?.data ?? []) as Row[]).map((r) => [r.id, r.content ?? ""]));
  const names = new Map<string, Row>(((namesR.data ?? []) as Row[]).map((b) => [b.id, b]));
  const stats = !countsR.error;
  const counts = new Map<string, { seen: number; acked: number }>();
  for (const c of (countsR.data ?? []) as Row[]) counts.set(c.announcement_id, { seen: Number(c.seen) || 0, acked: Number(c.acked) || 0 });
  const membersKnown = !membersR.error;
  const members = new Map<string, number>();
  for (const m of (membersR.data ?? []) as Row[]) members.set(m.building_id, (members.get(m.building_id) ?? 0) + 1);

  const sentBy = new Map<string, string>();
  for (const a of (auditR.data ?? []) as Row[]) if (a.entity_id && !sentBy.has(a.entity_id)) sentBy.set(a.entity_id, a.admin_email);
  const legacyAudits = ((legacyAuditR?.data ?? []) as Row[]);
  const senderOf = (x: (typeof shown)[number]): string | null => {
    if (x.broadcastId) return sentBy.get(x.broadcastId) ?? null;
    const t = new Date(x.createdAt).getTime();
    return legacyAudits.find((a) => a.metadata?.title === x.title && Math.abs(new Date(a.created_at).getTime() - t) <= 30 * 60_000)?.admin_email ?? null;
  };

  const buildingOfRow = new Map<string, string>(rowsRes.rows.map((r) => [r.id, r.building_id]));
  const broadcasts = shown.map((x) => {
    const rowsOf = new Map<string, string[]>();
    for (const id of x.ids) {
      const bid = buildingOfRow.get(id);
      if (bid) rowsOf.set(bid, [...(rowsOf.get(bid) ?? []), id]);
    }
    const perBuilding = x.buildingIds.map((bid) => {
      const ids = rowsOf.get(bid) ?? [];
      const seen = ids.reduce((s, id) => s + (counts.get(id)?.seen ?? 0), 0);
      const acked = ids.reduce((s, id) => s + (counts.get(id)?.acked ?? 0), 0);
      const b = names.get(bid);
      return {
        id: bid, name: (b?.name ?? "").trim() || "בניין שנמחק",
        suspended: b ? b.is_active === false || b.is_archived === true : false,
        active: !!x.activeByBuilding[bid],
        seen: stats ? seen : null, acked: stats && ackKnown ? acked : null,
        members: membersKnown ? members.get(bid) ?? 0 : null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "he"));
    const sum = (k: "seen" | "acked" | "members") => perBuilding.some((p) => p[k] === null) ? null : perBuilding.reduce((s, p) => s + (p[k] ?? 0), 0);
    return {
      key: x.key, broadcastId: x.broadcastId, legacy: x.legacy, ids: x.legacy ? x.ids : undefined,
      title: x.title, content: content.get(x.rep) ?? "", priority: x.priority, isPinned: x.isPinned, requiresAck: x.requiresAck,
      expiresAt: x.expiresAt, createdAt: x.createdAt, state: x.state, sender: senderOf(x),
      totals: { buildings: x.buildingIds.length, seen: sum("seen"), acked: sum("acked"), members: sum("members") },
      buildings: perBuilding,
    };
  });

  return NextResponse.json({
    configured: !!blocConfig(),
    canManage: can(g.session.role, "broadcast.manage"),
    canDelete: g.session.role === "superadmin",
    ack: ackKnown, stats,
    truncated: rowsRes.truncated || grouped.length > shown.length,
    broadcasts,
  }, { headers: noStore });
}

/** קריאה בנתחים (רשימות ארוכות ב-in / ב-rpc). כשל באחד — error. */
async function chunked(list: string[], size: number, run: (part: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: unknown[]; error: unknown }> {
  const out: unknown[] = [];
  for (let i = 0; i < list.length; i += size) {
    const { data, error } = await run(list.slice(i, i + size));
    if (error) return { data: out, error };
    out.push(...((data ?? []) as unknown[]));
  }
  return { data: out, error: null };
}

// ── שליחה ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const g = await guard({ permission: "broadcast.send" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, broadcastSchema);
  if (!p.ok) return p.response;
  const b = p.data;
  if (hasBlanks(b.title, b.content)) return NextResponse.json({ error: "נשארו בהודעה מקומות ריקים (___)" }, { status: 400 });
  const exp = resolveExpiry(b);
  if (!exp.ok) return NextResponse.json({ error: exp.error }, { status: 400 });

  const payload = {
    action: "send", actor: actorOf(g.session), broadcast_id: b.broadcast_id,
    title: b.title, content: b.content, priority: b.priority, expires_at: exp.value,
    requires_ack: !!b.requires_ack, is_pinned: !!b.is_pinned, building_ids: b.building_ids ?? null,
  };
  // המשך של שידור שהורד או נמחק מאז — לא (בשורות שנמחקו אין זכר; היומן כן). ההורדה והעריכה — גם bloc בודק.
  const { data: closed } = await adminClient.from("panel_audit_logs").select("action")
    .eq("entity_type", "broadcast").eq("entity_id", b.broadcast_id).in("action", ["BROADCAST_DELETE", "BROADCAST_END"])
    .eq("metadata->>ok", "true").limit(1);
  if (closed?.length) {
    return NextResponse.json({ code: "BROADCAST_CLOSED", error: "ההודעה הזו כבר הורדה או נמחקה, ולכן השליחה לא ממשיכה. כדי לשלוח שוב, צרו הודעה חדשה." }, { status: 409 });
  }

  const started = Date.now();
  let r = await callBloc("/api/internal/broadcast", payload);
  let lastOk = r.ok ? r : null;
  while (r.ok && Number(r.data.remaining) > 0 && Date.now() - started < RESUME_BUDGET_MS) {
    r = await callBloc("/api/internal/broadcast", payload);
    if (r.ok) lastOk = r;
  }
  // סבב המשך שנכשל — מה שכבר נשלח נשאר; המסך יראה את מה שנשאר וימשיך.
  const resumeError = !r.ok && lastOk ? { error: r.error, code: r.code } : null;

  // שידור שהמשיך: "already" של הסבב האחרון כולל את מה שנשלח בסבבים הקודמים.
  const n = (k: string) => (lastOk ? Number(lastOk.data[k]) || 0 : 0);
  const result = lastOk ? { total: n("total"), delivered: n("already") + n("sent"), failed: n("failed"), remaining: n("remaining"), skipped: n("skipped") } : null;
  await auditLog(g.session, "BROADCAST", "broadcast", b.broadcast_id, {
    title: b.title, priority: b.priority, target: b.building_ids ? b.building_ids.length : "all",
    expires_at: exp.value, requires_ack: !!b.requires_ack, is_pinned: !!b.is_pinned,
    ok: !!lastOk, ...(result ?? {}), ...(resumeError ? { resume_error: resumeError } : {}),
    ...(!r.ok && !lastOk ? { error: r.error, code: r.code } : {}),
  }, ip(req));

  if (!lastOk && !r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, broadcast_id: b.broadcast_id, expires_at: exp.value, ...result }, { headers: noStore });
}

// ── ניהול: הורדה / עריכה / תוקף ─────────────────────────────────────────────

export async function PATCH(req: Request) {
  const g = await guard({ permission: "broadcast.manage" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, broadcastManageSchema);
  if (!p.ok) return p.response;
  const b = p.data;
  const target = b.broadcast_id ? { broadcast_id: b.broadcast_id } : { ids: b.ids };

  const fields: Record<string, unknown> = {};
  if (b.action === "update") {
    if (hasBlanks(b.title, b.content)) return NextResponse.json({ error: "נשארו בהודעה מקומות ריקים (___)" }, { status: 400 });
    if (b.duration !== undefined) {
      const exp = resolveExpiry({ duration: b.duration, date: b.date });
      if (!exp.ok) return NextResponse.json({ error: exp.error }, { status: 400 });
      fields.expires_at = exp.value;
    }
    for (const k of ["title", "content", "priority", "requires_ack", "is_pinned"] as const) if (b[k] !== undefined) fields[k] = b[k];
    if (!Object.keys(fields).length) return NextResponse.json({ error: "אין מה לשמור" }, { status: 400 });
  }

  const r = await callBloc("/api/internal/broadcast", { action: b.action, actor: actorOf(g.session), ...target, ...fields });
  await auditLog(g.session, b.action === "end" ? "BROADCAST_END" : "BROADCAST_UPDATE", "broadcast", b.broadcast_id ?? `legacy:${b.ids?.[0]}`, {
    ...(b.ids ? { rows: b.ids.length } : {}), ...fields,
    ok: r.ok, ...(r.ok ? { matched: r.data.matched, changed: r.data.changed } : { error: r.error, code: r.code }),
  }, ip(req));
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, matched: r.data.matched, changed: r.data.changed, ...("expires_at" in fields ? { expires_at: fields.expires_at } : {}) }, { headers: noStore });
}

// ── מחיקה ───────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  const g = await guard({ permission: "broadcast.manage" });
  if (!g.ok) return g.response;
  if (g.session.role !== "superadmin") return NextResponse.json({ error: "רק סופר-אדמין יכול למחוק הודעה. אפשר להוריד אותה עכשיו." }, { status: 403 });
  const p = await parseBody(req, broadcastDeleteSchema);
  if (!p.ok) return p.response;
  const b = p.data;
  const target = b.broadcast_id ? { broadcast_id: b.broadcast_id } : { ids: b.ids };

  const r = await callBloc("/api/internal/broadcast", { action: "delete", actor: actorOf(g.session), ...target });
  await auditLog(g.session, "BROADCAST_DELETE", "broadcast", b.broadcast_id ?? `legacy:${b.ids?.[0]}`, {
    ...(b.ids ? { rows: b.ids.length } : {}),
    ok: r.ok, ...(r.ok ? { matched: r.data.matched, deleted: r.data.changed } : { error: r.error, code: r.code }),
  }, ip(req));
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, deleted: r.data.changed }, { headers: noStore });
}
