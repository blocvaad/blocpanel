import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { summarizeBilling, type SubRow } from "@/lib/billing";

export const dynamic = "force-dynamic";

// GET /api/billing — מצב חיוב הפלטפורמה. סופר-אדמין בלבד. קריאה בלבד:
// אין כאן שום פעולה שמשנה תשלום או מנוי.
export async function GET() {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;

  const [subsRes, eventsRes, compRes, health] = await Promise.all([
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, price_locked_until, current_period_end, trial_ends_at, past_due_since, cancel_requested_at, provider_recurring_uid, provider_cancelled_at, replaces_subscription_id, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(500),
    adminClient.from("billing_webhook_events")
      .select("provider, event_type, status, error, received_at, subscription_id")
      .order("received_at", { ascending: false }).limit(30),
    adminClient.from("buildings")
      .select("id, name, plan, comp_reason").not("comp_reason", "is", null).limit(200),
    fetchBlocBillingHealth(),
  ]);

  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 });

  const subs = (subsRes.data ?? []) as (SubRow & Record<string, unknown>)[];
  const buildingIds = [...new Set(subs.filter((s) => s.owner_type === "building").map((s) => s.owner_id))];
  const { data: buildings } = buildingIds.length
    ? await adminClient.from("buildings").select("id, name").in("id", buildingIds)
    : { data: [] as { id: string; name: string }[] };
  const names = Object.fromEntries((buildings ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  return NextResponse.json({
    health,
    summary: summarizeBilling(subs),
    subscriptions: subs.map((s) => ({ ...s, owner_name: names[s.owner_id] ?? null })),
    events: eventsRes.data ?? [],
    lastEventAt: eventsRes.data?.[0]?.received_at ?? null,
    compBuildings: compRes.data ?? [],
  });
}

type Health =
  | { reachable: true; payplusConfigured: boolean; sandbox: boolean; terminalUid: boolean }
  | { reachable: false; reason: string };

// בדיקת תצורה מול bloc — מחזירה רק כן/לא. המפתחות עצמם נשארים ב-Vercel של bloc.
async function fetchBlocBillingHealth(): Promise<Health> {
  const secret = process.env.PANEL_HEALTH_SECRET;
  const url = process.env.BLOC_BILLING_HEALTH_URL || "https://www.blocvaad.co.il/api/billing/health";
  if (!secret) return { reachable: false, reason: "PANEL_HEALTH_SECRET לא מוגדר בפאנל" };
  try {
    const res = await fetch(url, { headers: { "x-panel-secret": secret }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reachable: false, reason: `bloc החזיר ${res.status}` };
    const j = await res.json() as { payplus?: { configured?: boolean; sandbox?: boolean; terminal_uid?: boolean } };
    return { reachable: true, payplusConfigured: !!j.payplus?.configured, sandbox: !!j.payplus?.sandbox, terminalUid: !!j.payplus?.terminal_uid };
  } catch {
    return { reachable: false, reason: "אין תקשורת עם bloc" };
  }
}
