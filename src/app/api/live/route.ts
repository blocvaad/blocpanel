import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { buildLiveEvents, clampSince } from "@/lib/liveEvents";

// GET /api/live?since=ISO — אירועים מאז cursor + מונים. מחליף Realtime עם anon
// (שנחסם ע"י RLS ולכן לא החזיר כלום). cursor חדש = זמן השרת בתחילת הבקשה,
// כך שאירוע שנכתב בזמן השאילתות ייתפס בסבב הבא (כפילות מסוננת ב-id).
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const cursor = new Date().toISOString();
  const since = clampSince(req.nextUrl.searchParams.get("since"));

  const [stats, tenants, tickets, declined, hooks, reports, suppliers] = await Promise.all([
    adminClient.from("panel_stats_view").select("pending_approvals, open_tickets, total_tenants").single(),
    adminClient.from("profiles").select("id, full_name, building_id, created_at")
      .eq("approval_status", "pending").gt("created_at", since).order("created_at", { ascending: false }).limit(20),
    adminClient.from("service_tickets").select("id, title, urgency, building_id, created_at")
      .gt("created_at", since).order("created_at", { ascending: false }).limit(20),
    adminClient.from("payments").select("id, amount, building_id, failed_at")
      .gt("failed_at", since).neq("status", "paid").order("failed_at", { ascending: false }).limit(20),
    adminClient.from("webhook_log").select("id, event_type, building_id, created_at")
      .in("event_type", ["failed", "ip_blocked"]).gt("created_at", since).order("created_at", { ascending: false }).limit(20),
    adminClient.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    adminClient.from("supplier_profiles").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
  ]);

  const src = {
    tenants: tenants.data ?? [], tickets: tickets.data ?? [],
    declined: declined.data ?? [], webhookErrors: hooks.data ?? [],
  };
  const ids = [...new Set(Object.values(src).flat().map((r: any) => r.building_id).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data } = await adminClient.from("buildings").select("id, name").in("id", ids);
    for (const b of data ?? []) names[b.id] = b.name;
  }

  return NextResponse.json(
    {
      cursor,
      events: buildLiveEvents(src, names),
      stats: {
        pending_approvals: stats.data?.pending_approvals ?? 0,
        open_tickets: stats.data?.open_tickets ?? 0,
        pending_reports: reports.count ?? 0,
        supplier_queue: suppliers.count ?? 0,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
