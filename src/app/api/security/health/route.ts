// GET /api/security/health — בדיקה חיה של מה שנסגר ב-119–125 (panel_security_health),
// ותצורת השרת של bloc (משתני סביבה — /api/internal/health, חתום; כן/לא בלבד).
// סופר-אדמין. קריאה בלבד: הפאנל מציג, לא מתקן.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { isMissingRpc } from "@/lib/rpc";
import { callBloc } from "@/lib/blocApi";
import { healthSummary, blocHealthRows, type HealthRow } from "@/lib/securityHealth";

export const dynamic = "force-dynamic";

async function blocRows(): Promise<HealthRow[]> {
  const res = await callBloc("/api/internal/health", { check: "config" });
  if (!res.ok) return [{ check_key: "bloc_reachable", ok: false, detail: res.error }];
  const rows = blocHealthRows(res.data);
  return rows.length
    ? [{ check_key: "bloc_reachable", ok: true, detail: null }, ...rows]
    : [{ check_key: "bloc_reachable", ok: false, detail: "bloc החזיר תשובה בלי בדיקות (הגרסה עוד לא נפרסה?)" }];
}

export async function GET() {
  const g = await guard({ permission: "security.manage" });
  if (!g.ok) return g.response;
  const [{ data, error }, bloc] = await Promise.all([adminClient.rpc("panel_security_health"), blocRows()]);
  if (error && !isMissingRpc(error)) return NextResponse.json({ error: "הבדיקה נכשלה" }, { status: 500 });
  const dbRows = error ? [] : ((data ?? []) as HealthRow[]);
  const rows = [...dbRows, ...bloc];
  return NextResponse.json({
    available: !error || bloc.length > 0,
    rows,
    summary: healthSummary(rows),
    checkedAt: new Date().toISOString(),
  });
}
