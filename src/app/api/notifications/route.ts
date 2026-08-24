import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

// Panel notifications ONLY (audit P0.9). This reads panel_notifications —
// the platform's own alert stream — NOT the product `notifications` table,
// which belongs to residents/committees and must never surface in the panel.
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const { data } = await adminClient
    .from("panel_notifications")
    .select("id,type,title,body,is_read,entity_type,entity_id,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  // Normalize to the shape the client already expects (body → content).
  const rows = (data ?? []).map((n: any) => ({
    id: n.id, type: n.type, title: n.title, content: n.body,
    link: n.entity_type && n.entity_id ? `/${n.entity_type}/${n.entity_id}` : null,
    is_read: n.is_read, created_at: n.created_at,
  }));
  return NextResponse.json({ data: rows });
}
