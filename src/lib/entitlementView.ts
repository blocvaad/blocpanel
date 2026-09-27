// src/lib/entitlementView.ts — "מה הבניין מקבל ומי משלם", לתצוגה בפאנל.
//
// מקור האמת לאכיפה הוא bloc (lib/billing/entitlement.ts + 120). כאן רק מתרגמים
// את העובדות מ-panel_building_billing / panel_company_billing (125) לשורה אחת
// שמנהל פלטפורמה מבין בלי לפתוח את ה-DB. אין כאן החלטות הרשאה.
import { GRACE_DAYS, planLabel, anyPlanLabel } from "./plans";

const DAY = 24 * 60 * 60 * 1000;

export type BuildingBillingFacts = {
  plan: string | null;
  plan_expires: string | null;
  subscription_status: string | null;
  comp_reason: string | null;
  company_name: string | null;
  company_state: string | null;          // active | grace | exit_grace | managed_unpaid | null
  company_access_until: string | null;
  live_subscription_status: string | null;
};

export type Tone = "green" | "yellow" | "red" | "muted" | "blue";

export type BuildingEntitlementView = {
  effectivePlan: string;
  source: "company" | "company_grace" | "exit_grace" | "paid" | "trial" | "comp" | "grace" | "dormant" | "free";
  label: string;
  payer: string;
  tone: Tone;
  note: string | null;
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "");
const daysUntil = (iso: string, now: number) => Math.ceil((new Date(iso).getTime() - now) / DAY);

export function buildingEntitlementView(f: BuildingBillingFacts, now: number = Date.now()): BuildingEntitlementView {
  const own = ownPlanView(f, now);
  const companyNote = f.company_state === "managed_unpaid" && f.company_name
    ? `מנוהל ע״י ${f.company_name} — לחברה אין מסלול בתשלום, הבניין משתמש במסלול שלו`
    : null;

  if (f.company_state === "active" || f.company_state === "grace") {
    // בניין עם מנוי עצמי ששולם מראש נשאר עליו עד סוף התקופה — אבל המשלם הוא החברה.
    const prepaid = own.source === "paid" && own.effectivePlan === "tower";
    return {
      effectivePlan: "tower",
      source: f.company_state === "grace" ? "company_grace" : "company",
      label: `Pro דרך ${f.company_name ?? "חברת הניהול"}`,
      payer: f.company_name ?? "חברת הניהול",
      tone: f.company_state === "grace" ? "yellow" : "green",
      note: f.company_state === "grace"
        ? `החברה בחסד תשלום${f.company_access_until ? ` עד ${fmt(f.company_access_until)}` : ""}`
        : prepaid ? "לבניין מנוי עצמי ששולם מראש — לא יתחדש" : null,
    };
  }
  if (f.company_state === "exit_grace") {
    return {
      effectivePlan: "tower",
      source: "exit_grace",
      label: "חסד יציאה מחברת ניהול",
      payer: "אין — הוועד בוחר מסלול",
      tone: "yellow",
      note: f.company_access_until ? `היכולות נשמרות עד ${fmt(f.company_access_until)}, בלי חיוב אוטומטי` : null,
    };
  }
  return { ...own, note: own.note ?? companyNote };
}

function ownPlanView(f: BuildingBillingFacts, now: number): BuildingEntitlementView {
  const plan = f.plan && f.plan !== "free" ? f.plan : null;
  if (!plan) return { effectivePlan: "free", source: "free", label: "ללא מסלול", payer: "—", tone: "muted", note: null };

  if (f.comp_reason || !f.plan_expires) {
    return { effectivePlan: plan, source: "comp", label: `${planLabel(plan)} · ללא תשלום`, payer: "bloc (הענקה)", tone: "blue", note: f.comp_reason };
  }
  const left = daysUntil(f.plan_expires, now);
  const paying = ["active", "past_due", "cancel_pending"].includes(f.live_subscription_status ?? "") || f.subscription_status === "active";
  if (left > 0) {
    return paying
      ? { effectivePlan: plan, source: "paid", label: planLabel(plan), payer: "הבניין", tone: "green",
          note: f.live_subscription_status === "cancel_pending" ? `בוטל — פעיל עד ${fmt(f.plan_expires)}` : `מתחדש ב-${fmt(f.plan_expires)}` }
      : { effectivePlan: plan, source: "trial", label: `${planLabel(plan)} · ניסיון`, payer: "—", tone: "blue", note: `${left} ימים לסיום הניסיון` };
  }
  if (-left < GRACE_DAYS) {
    return { effectivePlan: plan, source: "grace", label: `${planLabel(plan)} · חסד`, payer: "הבניין", tone: "yellow", note: `פג לפני ${-left} ימים — ${GRACE_DAYS + left} ימי חסד נשארו` };
  }
  return { effectivePlan: "free", source: "dormant", label: "רדום — קריאה בלבד", payer: "—", tone: "red", note: `${planLabel(plan)} פג ב-${fmt(f.plan_expires)}` };
}

// ── חברת ניהול ─────────────────────────────────────────────────────────────
export type CompanyBillingFacts = {
  plan: string | null;
  plan_expires: string | null;
  comp_reason: string | null;
  trial_ends_at: string | null;
  grant_state: string | null;        // active | grace | lapsed | none
  grant_basis: string | null;        // comp | paid | trial
  access_until: string | null;
  active_buildings: number;
  pending_buildings: number;
  live_subscription_status: string | null;
  live_amount: number | string | null;
};

export type CompanyLifecycle = "free" | "trial" | "active" | "grace" | "lapsed" | "comp";

export function companyLifecycle(f: CompanyBillingFacts): CompanyLifecycle {
  if (!f.plan || f.plan === "mgmt_free" || f.grant_state === "none") return "free";
  if (f.grant_basis === "comp") return "comp";
  if (f.grant_state === "grace") return "grace";
  if (f.grant_state === "lapsed") return "lapsed";
  if (f.grant_basis === "trial") return "trial";
  return "active";
}

export const COMPANY_LIFECYCLE_LABEL: Record<CompanyLifecycle, { label: string; tone: Tone }> = {
  free:   { label: "ללא מסלול",                         tone: "muted" },
  trial:  { label: "ניסיון",                              tone: "blue" },
  active: { label: "משלמת",                              tone: "green" },
  grace:  { label: "חסד תשלום — הבניינים עדיין ב-Pro",  tone: "yellow" },
  lapsed: { label: "לא שילמה — הבניינים בחסד יציאה",    tone: "red" },
  comp:   { label: "מסלול ללא תשלום",                     tone: "blue" },
};

export function companySummary(f: CompanyBillingFacts): string {
  const lc = companyLifecycle(f);
  const plan = anyPlanLabel(f.plan);
  const until = f.access_until ? ` · עד ${fmt(f.access_until)}` : "";
  if (lc === "free") return "ללא מסלול";
  if (lc === "trial") return `${plan} · ניסיון${f.trial_ends_at ? ` עד ${fmt(f.trial_ends_at)}` : ""}`;
  if (lc === "comp") return `${plan} · ללא תשלום${f.comp_reason ? ` (${f.comp_reason})` : ""}`;
  return `${plan}${until}`;
}
