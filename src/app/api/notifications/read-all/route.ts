import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { reportRowsFilter } from "@/lib/dmReports";

// Mark ALL PANEL notifications as read (audit P0.9). Scoped to
// panel_notifications only — this must never touch the product
// `notifications` table (residents' notifications across every building).
// MOD-1 (review #1): only the rows this role can see — a viewer cannot clear the alert of a private-message report for the team.
export async function POST() {
  const g = await guard();
  if (!g.ok) return g.response;

  let q = adminClient
    .from("panel_notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  // bloc SAFETY-1: גם ההתראות על דיווח על תוכן — רק למי שרואה אותם (or אחד לשאילתה)
  const hidden = reportRowsFilter(can(g.session.role, "dm_reports.read"), can(g.session.role, "content_reports.read"));
  if (hidden) q = q.or(hidden);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "לא סומן" }, { status: 503 });

  return NextResponse.json({ ok: true });
}
