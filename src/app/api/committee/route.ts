// src/app/api/committee/route.ts — המשכיות ועד (bloc 133/134).
//
// GET  — מבט על: בקשות פתוחות (עם ספירה לאחור), בניינים בהעברה (מועד תשלום,
//        השהיית גבייה), בניינים בסיכון (אין ועד / ועד יחיד בלי ממלא מקום), היסטוריה.
//        ?building=<id> — פרטי בניין לפעולה: ראש ועד, ממלא מקום, חברים, בקשות.
// POST — פעולות צוות: request / execute / cancel / extend. הפאנל לא כותב ל-DB:
//        הבקשה נחתמת ונשלחת ל-bloc (lib/blocApi), שמריץ את אותו מסלול כמו
//        באפליקציה — עצירת הוראת קבע ב-PayPlus, מיילים, התראות ויומן.
//        כל פעולה מחייבת תיעוד (panel_note) ונרשמת גם ביומן הפאנל.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { callBloc, blocConfig } from "@/lib/blocApi";
import { parseBody, committeeActionSchema } from "@/lib/validation";
import { riskRows, REASON_LABEL, type SuccessionReason } from "@/lib/committee";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, any>;
type Person = { id: string; name: string; email: string | null; phone: string | null; apartment: string | null };

function missingSchema(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|could not find the table/i.test(e.message ?? ""));
}

async function people(ids: (string | null | undefined)[]): Promise<Map<string, Person>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, Person>();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await adminClient.from("profiles").select("id, full_name, email, phone, apartment").in("id", uniq.slice(i, i + 200));
    for (const p of (data ?? []) as Row[]) {
      out.set(p.id, { id: p.id, name: (p.full_name ?? "").trim() || "ללא שם", email: p.email ?? null, phone: p.phone ?? null, apartment: p.apartment != null ? String(p.apartment) : null });
    }
  }
  return out;
}
const pick = (m: Map<string, Person>, id: string | null | undefined): Person | null => (id ? m.get(id) ?? { id, name: "משתמש שנמחק", email: null, phone: null, apartment: null } : null);
// פרטי קשר — רק למי שמבצע פעולות (admin+) וצריך לאמת מול האנשים. viewer רואה שמות בלבד.
const redact = (p: Person | null): Person | null => (p ? { ...p, email: null, phone: null } : null);

async function activeMembers(buildingIds: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < buildingIds.length; i += 100) {
    const chunk = buildingIds.slice(i, i + 100);
    const r = await fetchAll<Row>((from, to) => adminClient.from("building_memberships")
      .select("building_id, user_id, role").eq("status", "active").in("building_id", chunk).order("building_id").range(from, to));
    out.push(...r.rows);
  }
  return out;
}

export async function GET(req: Request) {
  const g = await guard({ permission: "buildings.read" });
  if (!g.ok) return g.response;
  const canManage = ["admin", "superadmin"].includes(g.session.role);
  const canExecute = g.session.role === "superadmin";
  const configured = !!blocConfig();

  const building = new URL(req.url).searchParams.get("building");
  if (building) {
    if (!UUID.test(building)) return NextResponse.json({ error: "מזהה בניין לא תקין" }, { status: 400 });
    return detail(building, { canManage, canExecute, configured });
  }

  const since = new Date(Date.now() - 60 * DAY).toISOString();
  const { data: succ, error } = await adminClient.from("committee_successions").select("*")
    .or(`status.eq.pending,created_at.gte.${since}`).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (missingSchema(error)) return NextResponse.json({ available: false });
    return NextResponse.json({ error: "טעינת בקשות נכשלה" }, { status: 500 });
  }

  const [bRes, aRes, depRes, holdRes] = await Promise.all([
    fetchAll<Row>((from, to) => adminClient.from("buildings").select("id, name, address, founder_id, is_archived, subscription_status, plan_expires").order("id").range(from, to)),
    fetchAll<Row>((from, to) => adminClient.from("building_memberships").select("building_id, user_id").eq("role", "admin").eq("status", "active").order("building_id").range(from, to)),
    adminClient.from("committee_deputies").select("building_id, user_id, status").limit(10000),
    adminClient.from("building_collection_holds").select("building_id, created_at").is("released_at", null).limit(5000),
  ]);
  const buildings = new Map<string, Row>(bRes.rows.map((b) => [b.id, b]));
  const deputies = (depRes.data ?? []) as Row[];
  const held = new Set(((holdRes.data ?? []) as Row[]).map((h) => h.building_id));

  // סיכון: קודם מסננים לפי ספירת ועד, ורק למועמדים סופרים חברים.
  const adminCount = new Map<string, number>();
  for (const a of aRes.rows) adminCount.set(a.building_id, (adminCount.get(a.building_id) ?? 0) + 1);
  const activeDep = new Set(deputies.filter((d) => d.status === "active").map((d) => d.building_id));
  const candidates = bRes.rows.filter((b) => !b.is_archived && ((adminCount.get(b.id) ?? 0) === 0 || ((adminCount.get(b.id) ?? 0) === 1 && !activeDep.has(b.id)))).map((b) => b.id);
  const members = await activeMembers(candidates);
  const risk = riskRows({ buildings: bRes.rows as any, admins: aRes.rows as any, deputies: deputies as any, members: members as any });

  const rows = (succ ?? []) as Row[];
  const pendingRows = rows.filter((r) => r.status === "pending").sort((a, b) => String(a.execute_after).localeCompare(String(b.execute_after)));
  const executed = rows.filter((r) => r.status === "executed");
  const latestExec = new Map<string, Row>();
  for (const r of executed) if (!latestExec.has(r.building_id) || String(r.executed_at) > String(latestExec.get(r.building_id)!.executed_at)) latestExec.set(r.building_id, r);
  const handoverRows = [...latestExec.values()].filter((r) => buildings.get(r.building_id)?.subscription_status === "succession" || held.has(r.building_id));
  const historyRows = rows.filter((r) => r.status !== "pending").slice(0, 150);

  const riskShown = risk.slice(0, 300);
  const who = await people([
    ...rows.flatMap((r) => [r.requested_by, r.head_user_id]),
    ...handoverRows.map((r) => buildings.get(r.building_id)?.founder_id),
    ...riskShown.map((r) => r.founder_id),
  ]);
  const bRef = (id: string) => ({ id, name: buildings.get(id)?.name ?? "בניין שנמחק", address: buildings.get(id)?.address ?? null });
  const pk = (id: string | null | undefined) => (canManage ? pick(who, id) : redact(pick(who, id)));

  const now = Date.now();
  return NextResponse.json({
    available: true, canManage, canExecute, configured,
    pending: pendingRows.map((r) => ({
      id: r.id, building: bRef(r.building_id), requester: pk(r.requested_by), head: pk(r.head_user_id),
      reason: r.reason, reasonLabel: REASON_LABEL[r.reason as SuccessionReason] ?? r.reason, note: r.note ?? null,
      executeAfter: r.execute_after, createdAt: r.created_at, viaPanel: !!r.panel_actor, panelNote: r.panel_note ?? null, panelActor: r.panel_actor ?? null,
    })),
    handovers: handoverRows.map((r) => {
      const b = buildings.get(r.building_id);
      const needsPayment = b?.subscription_status === "succession";
      const deadline = needsPayment ? (b?.plan_expires ?? r.billing_deadline) : r.billing_deadline;
      return {
        id: r.id, building: bRef(r.building_id), newHead: pk(b?.founder_id), executedAt: r.executed_at, executedMode: r.executed_mode,
        deadline: deadline ?? null, expired: !!deadline && new Date(deadline).getTime() < now, needsPayment, collectionHeld: held.has(r.building_id),
        remindersSent: r.reminders_sent ?? [], panelNote: r.panel_note ?? null,
      };
    }).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline))),
    history: historyRows.map((r) => ({
      id: r.id, building: bRef(r.building_id), status: r.status, requester: pk(r.requested_by), head: pk(r.head_user_id),
      reasonLabel: REASON_LABEL[r.reason as SuccessionReason] ?? r.reason, at: r.executed_at ?? r.cancelled_at ?? r.created_at,
      cancelKind: r.cancel_kind ?? null, executedMode: r.executed_mode ?? null, panelActor: r.panel_actor ?? null, panelNote: r.panel_note ?? null,
    })),
    risk: {
      counts: {
        orphan: risk.filter((r) => r.level === "orphan").length,
        single_no_deputy: risk.filter((r) => r.level === "single_no_deputy").length,
        buildings: bRes.rows.filter((b) => !b.is_archived).length,
      },
      partial: bRes.truncated || aRes.truncated,
      rows: riskShown.map((r) => ({ ...r, head: pk(r.founder_id) })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

async function detail(id: string, flags: { canManage: boolean; canExecute: boolean; configured: boolean }) {
  const { data: b, error } = await adminClient.from("buildings")
    .select("id, name, address, founder_id, is_archived, subscription_status, plan_expires").eq("id", id).maybeSingle();
  if (error) {
    if (missingSchema(error)) return NextResponse.json({ available: false });
    return NextResponse.json({ error: "טעינת הבניין נכשלה" }, { status: 500 });
  }
  if (!b) return NextResponse.json({ error: "בניין לא נמצא" }, { status: 404 });

  const [mem, dep, succ, hold] = await Promise.all([
    activeMembers([id]),
    adminClient.from("committee_deputies").select("user_id, status, nominated_at, accepted_at").eq("building_id", id).maybeSingle(),
    adminClient.from("committee_successions").select("*").eq("building_id", id).order("created_at", { ascending: false }).limit(20),
    adminClient.from("building_collection_holds").select("created_at, released_at").eq("building_id", id).maybeSingle(),
  ]);
  const who = await people([...mem.map((m) => m.user_id), b.founder_id, dep.data?.user_id, ...((succ.data ?? []) as Row[]).flatMap((r) => [r.requested_by, r.head_user_id])]);
  const roleOf = new Map(mem.map((m) => [m.user_id, m.role]));

  // פרטי קשר רק לראש הוועד, לממלא המקום ולחברי הוועד — מי שהצוות צריך לאמת מולו.
  const contact = (p: Person | null) => (flags.canManage ? p : redact(p));
  const noContact = redact;
  const members = mem.map((m) => {
    const p = pick(who, m.user_id)!;
    const isCommittee = m.role === "admin" || m.user_id === b.founder_id || m.user_id === dep.data?.user_id;
    return { ...(isCommittee ? contact(p) : noContact(p))!, role: m.role as string, isHead: m.user_id === b.founder_id };
  }).sort((x, y) => Number(y.isHead) - Number(x.isHead) || Number(y.role === "admin") - Number(x.role === "admin") || x.name.localeCompare(y.name, "he"));

  const rows = (succ.data ?? []) as Row[];
  const pending = rows.find((r) => r.status === "pending") ?? null;
  return NextResponse.json({
    available: true, ...flags,
    building: { id: b.id, name: b.name, address: b.address ?? null, archived: !!b.is_archived, subscriptionStatus: b.subscription_status ?? null, planExpires: b.plan_expires ?? null },
    head: contact(pick(who, b.founder_id)),
    deputy: dep.data ? { ...contact(pick(who, dep.data.user_id))!, status: dep.data.status, since: dep.data.accepted_at ?? dep.data.nominated_at ?? null } : null,
    admins: mem.filter((m) => m.role === "admin").length,
    members,
    pendingId: pending?.id ?? null,
    collectionHeld: !!hold.data && !hold.data.released_at,
    requests: rows.map((r) => ({
      id: r.id, status: r.status, requester: noContact(pick(who, r.requested_by)), head: noContact(pick(who, r.head_user_id)),
      reasonLabel: REASON_LABEL[r.reason as SuccessionReason] ?? r.reason, note: r.note ?? null,
      executeAfter: r.execute_after, executedAt: r.executed_at ?? null, cancelledAt: r.cancelled_at ?? null, cancelKind: r.cancel_kind ?? null,
      executedMode: r.executed_mode ?? null, billingDeadline: r.billing_deadline ?? null, viaPanel: !!r.panel_actor, panelNote: r.panel_note ?? null,
      panelActor: r.panel_actor ?? null, requesterRole: roleOf.get(r.requested_by) ?? null,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

// ── פעולות ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const g = await guard({ permission: "committee.manage" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, committeeActionSchema);
  if (!p.ok) return p.response;
  const body = p.data;

  if (body.action === "execute" && g.session.role !== "superadmin") {
    return NextResponse.json({ error: "ביצוע מיידי (לפני 72 השעות) — סופר-אדמין בלבד" }, { status: 403 });
  }

  let buildingId: string;
  if (body.action === "request") {
    buildingId = body.building_id;
  } else {
    const { data } = await adminClient.from("committee_successions").select("building_id").eq("id", body.request_id).maybeSingle();
    if (!data) return NextResponse.json({ error: "הבקשה לא נמצאה" }, { status: 404 });
    buildingId = data.building_id;
  }

  const { confirm: _confirm, ...fields } = body as typeof body & { confirm?: true };
  const r = await callBloc("/api/internal/committee", {
    ...fields,
    actor: { id: g.session.id, email: g.session.email, role: g.session.role },
  });

  await auditLog(g.session, `COMMITTEE_${body.action.toUpperCase()}`, "building", buildingId, {
    ...("request_id" in body ? { request_id: body.request_id } : {}),
    ...(body.action === "request" ? { user_id: body.user_id, reason: body.reason } : {}),
    ...(body.action === "extend" ? { until: body.until } : {}),
    panel_note: body.panel_note, ok: r.ok, ...(r.ok ? {} : { error: r.error, code: r.code }),
  }, req.headers.get("x-forwarded-for") ?? undefined);

  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r.data);
}
