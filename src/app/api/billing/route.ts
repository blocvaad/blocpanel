import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { summarizeBilling, payplusEvidence, stopTaskContext, taskDetail, TASK_KIND_LABELS, GENERIC_TASK_LABEL, type SubRow } from "@/lib/billing";

export const dynamic = "force-dynamic";

const STUCK_LIST_LIMIT = 50;

// GET /api/billing — מצב חיוב הפלטפורמה. סופר-אדמין בלבד. קריאה בלבד: אין כאן
// שום פעולה שמשנה תשלום או מנוי.
//
// הכל נקרא ישירות מ-Supabase. בכוונה אין קריאת HTTP ל-bloc: Cloudflare חוסם
// בקשות שמגיעות ממרכזי נתונים (403 מהשרת של Vercel), והתלות הזו הייתה שקרית
// ממילא — מה שחשוב הוא אם התשלום עובד בפועל, וזה נמצא בנתונים.
export async function GET() {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;

  const beforeHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [subsRes, eventsRes, compRes, ledgerRes, compCompaniesRes, tasksRes, refundsRes, stuckRes] = await Promise.all([
    adminClient.from("billing_subscriptions")
      .select("id, owner_type, owner_id, plan_id, status, amount_ils, founding_price, price_locked_until, current_period_end, trial_ends_at, past_due_since, cancel_requested_at, provider_recurring_uid, provider_cancelled_at, provider_page_request_uid, replaces_subscription_id, ended_at, ended_reason, created_at, updated_at")
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
    // BILL-1a (221): משימות פתוחות של הצוות. עמודות מסוכמות בלבד — ה-payload לא יוצא (יש בו uid של הוראת קבע).
    adminClient.from("billing_tasks")
      .select("id, kind, status, subscription_id, owner_type, owner_id, building_id, created_at, payload")
      .eq("status", "open").eq("executor", "staff").order("created_at", { ascending: true }).limit(100),
    adminClient.from("subscription_refunds")
      .select("id, provider, kind, product, amount, currency, classification, outcome, subscription_id, owner_type, owner_id, occurred_at, created_at")
      .order("created_at", { ascending: false }).limit(50),
    // BILL-1d (C3): callbacks שנרשמו 'received' ולא עובדו מעל שעה — רשימה קצרה לסגירה ע"י הצוות.
    adminClient.from("billing_webhook_events")
      .select("id, event_type, event_key, occurred_at, received_at")
      .eq("status", "received").lt("received_at", beforeHour).order("received_at", { ascending: true }).limit(STUCK_LIST_LIMIT),
  ]);

  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 });

  const subs = (subsRes.data ?? []) as (SubRow & Record<string, unknown>)[];
  const events = eventsRes.data ?? [];
  const lastEventAt = events[0]?.received_at ?? null;

  type LedgerRow = { owner_type?: string | null; owner_id?: string | null; building_id?: string | null; [k: string]: unknown };
  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const ownerOf = (r: { owner_type?: string | null; owner_id?: string | null; building_id?: string | null }) =>
    ({ type: r.owner_type ?? "building", id: (r.owner_id ?? r.building_id ?? "") as string });

  // כשל קריאה = null (המסך אומר "הקריאה נכשלה"), לא [] ("אין משימות").
  type TaskRow = { id: string; kind: string; status: string; subscription_id: string | null; owner_type: string | null; owner_id: string | null; building_id: string | null; created_at: string; payload?: unknown };
  type RefundRow = { id: string; subscription_id: string | null; owner_type: string | null; owner_id: string | null; [k: string]: unknown };
  const taskRows = tasksRes.error ? null : ((tasksRes.data ?? []) as TaskRow[]);
  const refundRows = refundsRes.error ? null : ((refundsRes.data ?? []) as RefundRow[]);

  // המנוי של המשימה: סכום, מסלול, והאם יש הוראת קבע (בוליאני — ה-uid עצמו לא יוצא).
  const taskSubIds = [...new Set((taskRows ?? []).map((t) => t.subscription_id).filter(Boolean))] as string[];
  const taskSubsRes = taskSubIds.length
    ? await adminClient.from("billing_subscriptions").select("id, plan_id, amount_ils, status, provider_recurring_uid, provider_cancelled_at, current_period_end").in("id", taskSubIds)
    : { data: [] as Record<string, unknown>[], error: null };
  const taskSubs = Object.fromEntries(((taskSubsRes.data ?? []) as Array<Record<string, unknown>>).map((x) => [x.id as string, x]));

  const all = [...subs.map((x) => ({ type: x.owner_type, id: x.owner_id })), ...ledger.map(ownerOf),
    ...(taskRows ?? []).map((t) => ({ type: t.owner_type ?? "building", id: (t.owner_id ?? t.building_id ?? "") as string })),
    ...(refundRows ?? []).map((r) => ({ type: r.owner_type ?? "building", id: (r.owner_id ?? "") as string }))];
  const buildingIds = [...new Set(all.filter((o) => o.type === "building" && o.id).map((o) => o.id))];
  const companyIds  = [...new Set(all.filter((o) => o.type === "management_company" && o.id).map((o) => o.id))];
  const [{ data: buildings }, { data: companies }] = await Promise.all([
    buildingIds.length ? adminClient.from("buildings").select("id, name, is_active, is_archived").in("id", buildingIds) : Promise.resolve({ data: [] as { id: string; name: string; is_active?: boolean | null; is_archived?: boolean | null }[] }),
    companyIds.length ? adminClient.from("management_companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const names: Record<string, string> = Object.fromEntries(
    [...(buildings ?? []), ...(companies ?? [])].map((b: { id: string; name: string }) => [b.id, b.name]),
  );
  // BILL-1b: מצב הבניין (מושעה / בארכיון) לשורת ההקשר של משימת עצירה ידנית — מאותה קריאה, בלי שאילתה נוספת.
  const buildingRows = new Map(((buildings ?? []) as Array<{ id: string; is_active?: boolean | null; is_archived?: boolean | null }>).map((b) => [b.id, b]));

  return NextResponse.json({
    payplus: payplusEvidence(subs, lastEventAt),
    summary: summarizeBilling(subs),
    subscriptions: subs.map((s) => ({ ...s, owner_name: names[s.owner_id] ?? null })),
    ledger: ledger.map((r) => ({ ...r, owner_type: ownerOf(r).type, owner_name: names[ownerOf(r).id] ?? null })),
    compCompanies: compCompaniesRes.data ?? [],
    events,
    lastEventAt,
    compBuildings: compRes.data ?? [],
    // כשל קריאה = null (המסך: "—" ושורת שגיאה), לא [] ("אין").
    // BILL-1d (סקירה): גם מפתח האירוע של PayPlus (בלי הסיומת :received) וזמן האירוע — כדי לבדוק ב-PayPlus לפני סגירה.
    stuck_events: stuckRes.error ? null : ((stuckRes.data ?? []) as Array<{ id: string; event_type: string | null; event_key: string | null; occurred_at: string | null; received_at: string }>)
      .map((e) => ({ id: e.id, event_type: e.event_type, event_key: e.event_key ? e.event_key.replace(/:received$/, "") : null, occurred_at: e.occurred_at, received_at: e.received_at })),
    tasks: taskRows === null ? null : taskRows.map((t) => {
      const sub = t.subscription_id ? taskSubs[t.subscription_id] : undefined;
      const oid = (t.owner_id ?? t.building_id ?? "") as string;
      return {
        id: t.id, kind: t.kind, kind_label: TASK_KIND_LABELS[t.kind] ?? GENERIC_TASK_LABEL,
        detail: taskDetail(t.kind, t.payload), created_at: t.created_at,
        owner_type: t.owner_type ?? "building", owner_name: names[oid] ?? null, subscription_id: t.subscription_id,
        owner_state: (t.owner_type ?? "building") === "building" ? stopTaskContext(buildingRows.get(oid)) : null,
        plan_id: (sub?.plan_id as string | undefined) ?? null,
        amount: sub?.amount_ils ?? null,
        sub_status: (sub?.status as string | undefined) ?? null,
        current_period_end: (sub?.current_period_end as string | undefined) ?? null,
        has_recurring: !!sub?.provider_recurring_uid,
        // לא הצלחנו לקרוא את המנוי — "לא ידוע", לא "אין הוראת קבע".
        sub_read_failed: !!taskSubsRes.error,
      };
    }),
    refunds: refundRows === null ? null : refundRows.map((r) => ({
      id: r.id, provider: r.provider, kind: r.kind, product: r.product, amount: r.amount, currency: r.currency,
      classification: r.classification, outcome: r.outcome, subscription_id: r.subscription_id,
      owner_type: r.owner_type ?? "building", owner_name: names[(r.owner_id ?? "") as string] ?? null,
      occurred_at: r.occurred_at ?? r.created_at,
    })),
  });
}
