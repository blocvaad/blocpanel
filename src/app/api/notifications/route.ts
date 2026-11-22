import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { notificationLink } from "@/lib/committee";
import { can } from "@/lib/permissions";
import { WITHOUT_DM_ROWS } from "@/lib/dmReports";

// Panel notifications ONLY (audit P0.9). This reads panel_notifications —
// the platform's own alert stream — NOT the product `notifications` table,
// which belongs to residents/committees and must never surface in the panel.
// MOD-1 (review #1): a new private-message report (entity_type 'dm_report') only for roles that see reports (dm_reports.read).
// A failed read is 503 with an error — never an empty list ("no notifications").
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  let q = adminClient
    .from("panel_notifications")
    .select("id,type,title,body,is_read,entity_type,entity_id,created_at");
  if (!can(g.session.role, "dm_reports.read")) q = q.or(WITHOUT_DM_ROWS);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: "ההתראות לא נטענו", data: [] }, { status: 503 });

  // Normalize to the shape the client already expects (body → content).
  const rows = (data ?? []).map((n: any) => ({
    id: n.id, type: n.type, title: n.title, content: n.body,
    // entity_type 'building' → /buildings/<id> (הקישור הישן /building/<id> היה 404);
    // התראות המשכיות ועד → /committee?building=<id>.
    link: notificationLink(n),
    is_read: n.is_read, created_at: n.created_at,
  }));
  return NextResponse.json({ data: rows });
}
