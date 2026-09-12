import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { summarizeBilling, payplusEvidence, type SubRow } from "@/lib/billing";

export const dynamic = "force-dynamic";

// GET /api/billing — מצב חיוב הפלטפורמה. סופר-אדמין בלבד. קריאה בלבד: אין כאן
// שום פעולה שמשנה תשלום או מנוי.
//
// הכל נקרא ישירות מ-Supabase. בכוונה אין קריאת HTTP ל-bloc: Cloudflare חוסם
// בקשות שמגיעות ממרכזי נתונים (403 מהשרת של Vercel), והתלות הזו הייתה שקרית
// ממילא — מה שחשוב הוא אם התשלום עובד בפועל, וזה נמצא בנתונים.
export async function GET() {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;

  const [subsRes, eventsRes, compRes] = await Promise.all([
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, price_locked_until, current_period_end, trial_ends_at, past_due_since, cancel_requested_at, provider_recurring_uid, provider_cancelled_at, provider_page_request_uid, replaces_subscription_id, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(500),
    adminClient.from("billing_webhook_events")
      .select("provider, event_type, status, error, received_at, subscription_id")
      .order("received_at", { ascending: false }).limit(30),
    adminClient.from("buildings")
      .select("id, name, plan, comp_reason").not("comp_reason", "is", null).limit(200),
  ]);

  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 });

  const subs = (subsRes.data ?? []) as (SubRow & Record<string, unknown>)[];
  const events = eventsRes.data ?? [];
  const lastEventAt = events[0]?.received_at ?? null;

  const buildingIds = [...new Set(subs.filter((s) => s.owner_type === "building").map((s) => s.owner_id))];
  const { data: buildings } = buildingIds.length
    ? await adminClient.from("buildings").select("id, name").in("id", buildingIds)
    : { data: [] as { id: string; name: string }[] };
  const names = Object.fromEntries((buildings ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  return NextResponse.json({
    payplus: payplusEvidence(subs, lastEventAt),
    summary: summarizeBilling(subs),
    subscriptions: subs.map((s) => ({ ...s, owner_name: names[s.owner_id] ?? null })),
    events,
    lastEventAt,
    compBuildings: compRes.data ?? [],
  });
}
