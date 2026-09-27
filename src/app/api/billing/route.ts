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

  const [subsRes, eventsRes, compRes, ledgerRes, compCompaniesRes] = await Promise.all([
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, price_locked_until, current_period_end, trial_ends_at, past_due_since, cancel_requested_at, provider_recurring_uid, provider_cancelled_at, provider_page_request_uid, replaces_subscription_id, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(500),
    adminClient.from("billing_webhook_events")
      .select("provider, event_type, status, error, received_at, subscription_id")
      .order("received_at", { ascending: false }).limit(30),
    adminClient.from("buildings")
      .select("id, name, plan, comp_reason").not("comp_reason", "is", null).limit(200),
    // יומן החיובים (121): כל תשלום שהתקבל מ-PayPlus — בניינים וחברות ניהול.
    adminClient.from("subscription_payments").select("*").order("created_at", { ascending: false }).limit(50),
    adminClient.from("management_companies")
      .select("id, name, plan, comp_reason").not("comp_reason", "is", null).limit(200),
  ]);

  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 });

  const subs = (subsRes.data ?? []) as (SubRow & Record<string, unknown>)[];
  const events = eventsRes.data ?? [];
  const lastEventAt = events[0]?.received_at ?? null;

  type LedgerRow = { owner_type?: string | null; owner_id?: string | null; building_id?: string | null; [k: string]: unknown };
  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const ownerOf = (r: { owner_type?: string | null; owner_id?: string | null; building_id?: string | null }) =>
    ({ type: r.owner_type ?? "building", id: (r.owner_id ?? r.building_id ?? "") as string });

  const all = [...subs.map((x) => ({ type: x.owner_type, id: x.owner_id })), ...ledger.map(ownerOf)];
  const buildingIds = [...new Set(all.filter((o) => o.type === "building" && o.id).map((o) => o.id))];
  const companyIds  = [...new Set(all.filter((o) => o.type === "management_company" && o.id).map((o) => o.id))];
  const [{ data: buildings }, { data: companies }] = await Promise.all([
    buildingIds.length ? adminClient.from("buildings").select("id, name").in("id", buildingIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    companyIds.length ? adminClient.from("management_companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const names: Record<string, string> = Object.fromEntries(
    [...(buildings ?? []), ...(companies ?? [])].map((b: { id: string; name: string }) => [b.id, b.name]),
  );

  return NextResponse.json({
    payplus: payplusEvidence(subs, lastEventAt),
    summary: summarizeBilling(subs),
    subscriptions: subs.map((s) => ({ ...s, owner_name: names[s.owner_id] ?? null })),
    ledger: ledger.map((r) => ({ ...r, owner_type: ownerOf(r).type, owner_name: names[ownerOf(r).id] ?? null })),
    compCompanies: compCompaniesRes.data ?? [],
    events,
    lastEventAt,
    compBuildings: compRes.data ?? [],
  });
}
