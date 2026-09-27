// GET /api/money — בקרת כסף. קריאה בלבד: הפאנל לא "מסמן שולם".
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { summarizeBilling, type SubRow } from "@/lib/billing";
import { summarizeMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const g = await guard({ permission: "payments.read" });
  if (!g.ok) return g.response;
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const before7 = new Date(now - 7 * DAY).toISOString();
  const before45 = new Date(now - 45 * DAY).toISOString();

  const [reviewsRes, staleRes, staleCountRes, disputesRes, subsRes, externalRes, batchesRes] = await Promise.all([
    adminClient.from("webhook_log").select("id, payment_id, building_id, raw_payload, created_at")
      .eq("event_type", "failed").gte("created_at", since30).order("created_at", { ascending: false }).limit(50),
    adminClient.from("payments").select("id, building_id, amount, title, created_at")
      .eq("status", "pending_approval").lt("created_at", before7).order("created_at", { ascending: true }).limit(20),
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "pending_approval").lt("created_at", before7),
    adminClient.from("supplier_payments").select("id, building_id, supplier_id, amount, dispute_reason, disputed_at")
      .eq("confirmation_status", "disputed").order("disputed_at", { ascending: false }).limit(50),
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, current_period_end, past_due_since, provider_recurring_uid, provider_cancelled_at, cancel_requested_at, created_at")
      .in("status", ["cancelled", "cancel_pending", "checkout_pending"]).limit(1000),
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "external_pending").lt("created_at", before45),
    adminClient.from("payment_external_refs").select("import_batch, company_id, building_id, amount, created_at")
      .order("created_at", { ascending: false }).limit(300),
  ]);

  // "לבדיקה" = callbacks שנרשמו כ-failed עם סיבה (122/124). דחיית כרטיס רגילה אינה כזו.
  type Review = { id: string; payment_id: string | null; building_id: string | null; raw_payload: Record<string, unknown> | null; created_at: string };
  const reviews = ((reviewsRes.data ?? []) as Review[])
    .map((r) => ({ ...r, reason: typeof r.raw_payload?.reason === "string" ? (r.raw_payload.reason as string) : null }))
    .filter((r) => r.reason);

  const billing = summarizeBilling((subsRes.data ?? []) as SubRow[], now);

  // אצוות ייבוא התאמה אחרונות (חברות ניהול).
  const batches: Record<string, { batch: string; company_id: string | null; rows: number; amount: number; at: string }> = {};
  for (const r of (batchesRes.data ?? []) as Array<{ import_batch: string | null; company_id: string | null; amount: number; created_at: string }>) {
    const k = r.import_batch ?? "manual";
    const b = (batches[k] ??= { batch: k, company_id: r.company_id, rows: 0, amount: 0, at: r.created_at });
    b.rows++; b.amount += Number(r.amount) || 0;
  }

  const disputes = disputesRes.error ? null : (disputesRes.data ?? []);

  // שמות לתצוגה
  const bIds = [...new Set([...reviews.map((r) => r.building_id), ...(staleRes.data ?? []).map((p) => p.building_id), ...(disputes ?? []).map((d) => d.building_id)].filter(Boolean))] as string[];
  const sIds = [...new Set((disputes ?? []).map((d) => d.supplier_id))];
  const cIds = [...new Set(Object.values(batches).map((b) => b.company_id).filter(Boolean))] as string[];
  const [bRes, sRes, cRes] = await Promise.all([
    bIds.length ? adminClient.from("buildings").select("id, name").in("id", bIds) : Promise.resolve({ data: [] }),
    sIds.length ? adminClient.from("supplier_profiles").select("id, business_name").in("id", sIds) : Promise.resolve({ data: [] }),
    cIds.length ? adminClient.from("management_companies").select("id, name").in("id", cIds) : Promise.resolve({ data: [] }),
  ]);
  const bName = Object.fromEntries(((bRes.data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
  const sName = Object.fromEntries(((sRes.data ?? []) as Array<{ id: string; business_name: string }>).map((s) => [s.id, s.business_name]));
  const cName = Object.fromEntries(((cRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  const tiles = summarizeMoney({
    webhookReviews: reviews,
    staleReports: staleCountRes.count ?? 0,
    disputes: disputes === null ? null : disputes.length,
    recurringNotStopped: billing.alerts.recurringNotStopped.length,
    stuckCheckouts: billing.alerts.stuckCheckouts.length,
    staleExternal: externalRes.count ?? 0,
  });

  return NextResponse.json({
    tiles,
    reviews: reviews.map((r) => ({ id: r.id, payment_id: r.payment_id, building_id: r.building_id, building_name: bName[r.building_id ?? ""] ?? null, reason: r.reason, amount: r.raw_payload?.amount ?? null, provider: r.raw_payload?.provider ?? null, at: r.created_at })),
    staleReports: (staleRes.data ?? []).map((p) => ({ ...p, building_name: bName[p.building_id] ?? null })),
    disputes: (disputes ?? []).map((d) => ({ ...d, building_name: bName[d.building_id] ?? null, supplier_name: sName[d.supplier_id] ?? null })),
    batches: Object.values(batches).slice(0, 8).map((b) => ({ ...b, company_name: b.company_id ? cName[b.company_id] ?? null : null })),
  });
}
