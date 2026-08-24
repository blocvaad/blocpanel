import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

// Mark ALL PANEL notifications as read (audit P0.9). Scoped to
// panel_notifications only — this must never touch the product
// `notifications` table (residents' notifications across every building).
export async function POST() {
  const g = await guard();
  if (!g.ok) return g.response;

  await adminClient
    .from("panel_notifications")
    .update({ is_read: true })
    .eq("is_read", false);

  return NextResponse.json({ ok: true });
}
