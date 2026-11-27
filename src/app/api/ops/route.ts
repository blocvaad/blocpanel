// src/app/api/ops/route.ts — bloc OPS-1 (שלב 9, החלטות 752–755): מרכז התפעול.
//
// GET (ops.read — כל תפקידי הפאנל): מצב התפעול מ-bloc (api/internal/ops: משימות, גיבוי, תורים, תצורה), יומן התקלות (הפתוחות
//   ו-30 האחרונות, עם ציר הזמן) ותרגולי השחזור האחרונים. כל חלק לבד: כשל — null ("לא נטען"), לא רשימה ריקה.
// POST (ops.manage — admin וסופר-אדמין): open (תקלה חדשה, עם ספר הפעלה), update (עדכון בציר הזמן / "במעקב"), resolve
//   (סגירה עם סיכום), drill (תרגול שחזור). כל פעולה ביומן הפעולות של הפאנל. תקלה פתוחה על אותו מקור — 409.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { can } from "@/lib/permissions";
import { drillDateOk, opsActionSchema, type OpsResponse, type OpsSnapshot } from "@/lib/ops";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const g = await guard({ permission: "ops.read" });
  if (!g.ok) return g.response;
  const [bloc, inc, drills] = await Promise.all([
    callBloc("/api/internal/ops", {}),
    adminClient.from("ops_incidents").select("*").order("opened_at", { ascending: false }).limit(30),
    adminClient.from("ops_restore_drills").select("*").order("done_at", { ascending: false }).limit(10),
  ]);
  const incidents = inc.error ? null : (inc.data ?? []);
  let updates: OpsResponse["updates"] = [];
  if (incidents && incidents.length) {
    const ids = incidents.map((i: { id: string }) => i.id);
    const u = await adminClient.from("ops_incident_updates").select("*").in("incident_id", ids).order("at", { ascending: true }).limit(500);
    if (!u.error) updates = u.data ?? [];
  }
  const snapshot = bloc.ok && bloc.data && typeof bloc.data.snapshot === "object" ? (bloc.data.snapshot as OpsSnapshot) : null;
  const body: OpsResponse = {
    snapshot,
    snapshotError: snapshot ? null : (bloc.ok ? "תשובה לא צפויה מ-bloc" : bloc.error),
    incidents,
    updates,
    drills: drills.error ? null : (drills.data ?? []),
    canManage: can(g.session.role, "ops.manage"),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const g = await guard({ permission: "ops.manage" });
  if (!g.ok) return g.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 }); }
  const parsed = opsActionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "בקשה לא תקינה" }, { status: 400 });
  const a = parsed.data;
  // the session is the staff member (PanelSession extends PanelAdmin)
  const by = g.session.email;
  const now = new Date().toISOString();

  if (a.action === "open") {
    const { data, error } = await adminClient.from("ops_incidents").insert({
      title: a.title, severity: a.severity, playbook: a.playbook ?? null, source: a.source ?? null, summary: a.summary || null, opened_by_email: by,
    }).select("id").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "כבר יש תקלה פתוחה על זה — עדכנו אותה" }, { status: 409 });
      return NextResponse.json({ error: "התקלה לא נשמרה. נסו שוב." }, { status: 500 });
    }
    await auditLog(g.session, "ops_incident_opened", "ops_incident", data.id, { severity: a.severity, playbook: a.playbook ?? null, source: a.source ?? null });
    return NextResponse.json({ ok: true, id: data.id }, { headers: NO_STORE });
  }

  if (a.action === "update" || a.action === "resolve") {
    const { data: cur, error: readErr } = await adminClient.from("ops_incidents").select("id, status").eq("id", a.id).maybeSingle();
    if (readErr) return NextResponse.json({ error: "התקלה לא נטענה. נסו שוב." }, { status: 500 });
    if (!cur) return NextResponse.json({ error: "התקלה לא נמצאה" }, { status: 404 });
    if (cur.status === "resolved") return NextResponse.json({ error: "התקלה כבר נסגרה" }, { status: 409 });
    if (a.action === "resolve") {
      const { error } = await adminClient.from("ops_incidents")
        .update({ status: "resolved", resolved_at: now, resolved_by_email: by, summary: a.summary, updated_at: now })
        .eq("id", a.id).neq("status", "resolved");
      if (error) return NextResponse.json({ error: "התקלה לא נסגרה. נסו שוב." }, { status: 500 });
      await adminClient.from("ops_incident_updates").insert({ incident_id: a.id, by_email: by, status: "resolved", note: a.summary });
      await auditLog(g.session, "ops_incident_resolved", "ops_incident", a.id, {});
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const { error } = await adminClient.from("ops_incident_updates").insert({ incident_id: a.id, by_email: by, status: a.status ?? null, note: a.note });
    if (error) return NextResponse.json({ error: "העדכון לא נשמר. נסו שוב." }, { status: 500 });
    const patch: Record<string, unknown> = { updated_at: now };
    if (a.status && a.status !== cur.status) patch.status = a.status;
    await adminClient.from("ops_incidents").update(patch).eq("id", a.id).neq("status", "resolved");
    await auditLog(g.session, "ops_incident_updated", "ops_incident", a.id, { status: a.status ?? null });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // drill
  if (!drillDateOk(a.backup_date)) return NextResponse.json({ error: "התאריך של הגיבוי לא תקין (לא בעתיד)" }, { status: 400 });
  const { data, error } = await adminClient.from("ops_restore_drills").insert({
    done_by_email: by, backup_date: a.backup_date, method: a.method, result: a.result,
    tables_checked: a.tables_checked ?? null, rows_checked: a.rows_checked ?? null, mismatches: a.mismatches ?? null, notes: a.notes || null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "התרגול לא נשמר. נסו שוב." }, { status: 500 });
  await auditLog(g.session, "ops_drill_recorded", "ops_restore_drill", data.id, { method: a.method, result: a.result });
  return NextResponse.json({ ok: true, id: data.id }, { headers: NO_STORE });
}
