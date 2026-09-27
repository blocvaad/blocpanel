// GET /api/security/health — בדיקה חיה של מה שנסגר ב-119–125 (panel_security_health).
// סופר-אדמין. קריאה בלבד: הפאנל מציג, לא מתקן.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { isMissingRpc } from "@/lib/rpc";
import { healthSummary, type HealthRow } from "@/lib/securityHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard({ permission: "security.manage" });
  if (!g.ok) return g.response;
  const { data, error } = await adminClient.rpc("panel_security_health");
  if (error) {
    if (isMissingRpc(error)) return NextResponse.json({ available: false, rows: [], summary: null });
    return NextResponse.json({ error: "הבדיקה נכשלה" }, { status: 500 });
  }
  const rows = (data ?? []) as HealthRow[];
  return NextResponse.json({ available: true, rows, summary: healthSummary(rows), checkedAt: new Date().toISOString() });
}
