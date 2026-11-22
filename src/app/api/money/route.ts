// GET /api/money — בקרת כסף. קריאה בלבד: הפאנל לא "מסמן שולם".
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { summarizeBilling, type SubRow } from "@/lib/billing";
import { summarizeMoney, billingRejection } from "@/lib/money";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const g = await guard({ permission: "payments.read" });
  if (!g.ok) return g.response;
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const before7 = new Date(now - 7 * DAY).toISOString();
  const before45 = new Date(now - 45 * DAY).toISOString();
  const beforeHour = new Date(now - 60 * 60 * 1000).toISOString();

  const [reviewsRes, staleRes, staleCountRes, disputesRes, subsRes, externalRes, batchesRes, billingRejectedRes, dbErrorsRes, tasksOpenRes, refundTasksRes, stuckEventsRes] = await Promise.all([
    // PAY-0 (סקירה): רק שורות עם סיבה, ובלי db_error — בשאילתה, לא אחריה. עד עכשיו נלקחו 50 ה-failed האחרונים וסוננו
    // אחר כך: דחיות כרטיס רגילות (בלי סיבה) תפסו את המקומות, ופריטים אמיתיים נעלמו מהרשימה ומהאריח. הספירה — מה-DB.
    // S345 (שלב 4): רק השדות שהמסך מציג מתוך ה-payload — לא ה-payload כולו (נתוני תשלום גולמיים לא יוצאים מ-bloc)
    adminClient.from("webhook_log").select("id, payment_id, building_id, created_at, reason:raw_payload->>reason, amount:raw_payload->amount, provider:raw_payload->>provider, owed:raw_payload->owed, detail:raw_payload->>detail, kind:raw_payload->>kind, untrusted:raw_payload->untrusted", { count: "exact" })
      .eq("event_type", "failed").gte("created_at", since30)
      .not("raw_payload->>reason", "is", null).neq("raw_payload->>reason", "db_error")
      .order("created_at", { ascending: false }).limit(50),
    adminClient.from("payments").select("id, building_id, amount, title, created_at")
      .eq("status", "pending_approval").lt("created_at", before7).order("created_at", { ascending: true }).limit(20),
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "pending_approval").lt("created_at", before7),
    // LEDGER-1b (bloc 214, החלטה 306): רשומה שסימון התשלום שלה בוטל — אין עליה מחלוקת פתוחה (הספק לא יכול לאשר אותה).
    adminClient.from("supplier_payments").select("id, building_id, supplier_id, amount, dispute_reason, disputed_at")
      .eq("confirmation_status", "disputed").is("reversed_at", null).order("disputed_at", { ascending: false }).limit(50),
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, current_period_end, past_due_since, provider_recurring_uid, provider_cancelled_at, cancel_requested_at, created_at")
      .in("status", ["cancelled", "cancel_pending", "checkout_pending"]).limit(1000),
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "external_pending").lt("created_at", before45),
    adminClient.from("payment_external_refs").select("import_batch, company_id, building_id, amount, created_at")
      .order("created_at", { ascending: false }).limit(300),
    // PAY-0: callbacks חתומים של מנוי ש-bloc לא החיל (נרשמים מ-PAY-0; לפני כן — Sentry בלבד).
    // BILL-1d (סקירה): סמן callback תקוע שהצוות סגר (סגירה ידנית ב-bloc → failed, error 'staff: …') אינו חיוב שנדחה — לא נספר כאן.
    adminClient.from("billing_webhook_events").select("id, event_type, subscription_id, error, received_at", { count: "exact" })
      .eq("status", "failed").gte("received_at", since30).or("error.is.null,error.not.like.staff:*")
      .order("received_at", { ascending: false }).limit(50),
    // תקלות DB רגעיות (הספק שולח שוב) — רק ספירה, לאריח משלהן.
    adminClient.from("webhook_log").select("id", { count: "exact", head: true })
      .eq("event_type", "failed").gte("created_at", since30).eq("raw_payload->>reason", "db_error"),
    // BILL-1a: ספירות בלבד, מה-DB (בלי תקרת רשימה). כשל — null → "—" והאריח אומר שהקריאה נכשלה.
    adminClient.from("billing_tasks").select("id", { count: "exact", head: true }).eq("status", "open").eq("executor", "staff"),
    adminClient.from("billing_tasks").select("id", { count: "exact", head: true }).eq("status", "open").eq("executor", "staff")
      .in("kind", ["refund_review", "refund_unmatched"]),
    // BILL-1b (S983/E45): callback שנרשם 'received' ולא עובד תוך שעה. ספירה בלבד; כשל → null → "—".
    adminClient.from("billing_webhook_events").select("id", { count: "exact", head: true })
      .eq("status", "received").lt("received_at", beforeHour),
  ]);

  // "לבדיקה" = callbacks שנרשמו כ-failed עם סיבה (122/124/PAY-0). דחיית כרטיס רגילה אינה כזו. קריאה שנכשלה — null.
  type Review = { id: string; payment_id: string | null; building_id: string | null; created_at: string; reason: unknown; amount: unknown; provider: unknown; owed: unknown; detail: unknown; kind: unknown; untrusted: unknown };
  const reviewsFailed = !!reviewsRes.error;
  const reviews = ((reviewsRes.data ?? []) as Review[])
    .map((r) => ({ ...r, reason: typeof r.reason === "string" ? r.reason : null }))
    .filter((r): r is Review & { reason: string } => !!r.reason);
  const reviewTotal = reviewsFailed ? null : (reviewsRes.count ?? reviews.length);
  const dbErrors = dbErrorsRes.error ? null : (dbErrorsRes.count ?? 0);

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

  type Rejected = { id: string; event_type: string; subscription_id: string | null; error: string | null; received_at: string };
  // קריאה שנכשלה — לא "אין": null, והאריח אומר את זה (design-language §8).
  const billingRejected = billingRejectedRes.error ? null : ((billingRejectedRes.data ?? []) as Rejected[])
    .map((e) => ({ id: e.id, subscription_id: e.subscription_id, at: e.received_at, ...billingRejection(e.error) }));

  const tiles = summarizeMoney({
    billingRejected: billingRejected === null ? null : (billingRejectedRes.count ?? billingRejected.length),
    reviewTotal,
    transientTotal: dbErrors,
    webhookReviews: reviews,
    staleReports: staleCountRes.count ?? 0,
    disputes: disputes === null ? null : disputes.length,
    recurringNotStopped: billing.alerts.recurringNotStopped.length,
    stuckCheckouts: billing.alerts.stuckCheckouts.length,
    staleExternal: externalRes.count ?? 0,
    billingTasksOpen: tasksOpenRes.error ? null : (tasksOpenRes.count ?? 0),
    refundsToReview: refundTasksRes.error ? null : (refundTasksRes.count ?? 0),
    stuckCallbacks: stuckEventsRes.error ? null : (stuckEventsRes.count ?? 0),
  });

  return NextResponse.json({
    tiles,
    reviews: reviewsFailed ? null : reviews.map((r) => ({ id: r.id, payment_id: r.payment_id, building_id: r.building_id, building_name: bName[r.building_id ?? ""] ?? null, reason: r.reason, amount: r.amount ?? null, provider: r.provider ?? null,
      owed: r.owed ?? null, detail: r.detail ?? null, kind: r.kind ?? null, untrusted: r.untrusted === true, at: r.created_at })),
    reviewTotal,
    billingRejected,
    billingRejectedTotal: billingRejected === null ? null : (billingRejectedRes.count ?? billingRejected.length),
    staleReports: (staleRes.data ?? []).map((p) => ({ ...p, building_name: bName[p.building_id] ?? null })),
    // LEDGER-1b: קריאה שנכשלה — null (הרשימה אומרת "הקריאה נכשלה"), לא [] ("אין מחלוקות").
    disputes: disputes === null ? null : disputes.map((d) => ({ ...d, building_name: bName[d.building_id] ?? null, supplier_name: sName[d.supplier_id] ?? null })),
    batches: Object.values(batches).slice(0, 8).map((b) => ({ ...b, company_name: b.company_id ? cName[b.company_id] ?? null : null })),
  });
}
