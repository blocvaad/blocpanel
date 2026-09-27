// src/lib/plans.ts (blocpanel)
//
// מזהי החבילות — מראה של bloc/src/lib/plans.ts (אותם מזהים שנשמרים ב-buildings.plan
// ושה-CHECK ב-DB מאפשר). כל שינוי שם חייב להיעשות בשני המקומות.
// המחירים כאן לתצוגה בלבד; מקור האמת לחיוב הוא bloc.

export const PLAN_OPTIONS = [
  { value: "free",     label: "ללא מסלול",        price: 0 },
  { value: "building", label: "Core",             price: 59 },
  { value: "large",    label: "Plus",             price: 119 },
  { value: "tower",    label: "Pro",              price: 199 },
  { value: "company",  label: "Management Start", price: 649 },
] as const;

export type PlanId = (typeof PLAN_OPTIONS)[number]["value"];

export const PLAN_IDS = PLAN_OPTIONS.map((p) => p.value) as [PlanId, ...PlanId[]];

export function planLabel(id: string | null | undefined): string {
  return PLAN_OPTIONS.find((p) => p.value === id)?.label ?? (id || "—");
}

/** מנויים שמשלמים דרך PayPlus — הפאנל לא משנה להם חבילה ידנית. */
export const PAYING_STATUSES = ["trialing", "active", "past_due", "cancel_pending"] as const;

// ── מסלולי חברות ניהול — מראה של bloc/src/lib/billing/managementPlans.ts ──────
// כל מסלול בתשלום נותן לבנייני החברה Pro (tower). mgmt_free = אין זכאות.
export const MGMT_PLAN_OPTIONS = [
  { value: "mgmt_free",       label: "ללא מסלול", price: 0,    maxBuildings: 1 },
  { value: "mgmt_solo",       label: "Solo",       price: 249,  maxBuildings: 3 },
  { value: "mgmt_start",      label: "Start",      price: 649,  maxBuildings: 10 },
  { value: "mgmt_growth",     label: "Growth",     price: 1490, maxBuildings: 30 },
  { value: "mgmt_pro",        label: "Pro",        price: 2490, maxBuildings: 75 },
  { value: "mgmt_enterprise", label: "Enterprise", price: 0,    maxBuildings: Number.POSITIVE_INFINITY },
] as const;

export type MgmtPlanId = (typeof MGMT_PLAN_OPTIONS)[number]["value"];
export const MGMT_PLAN_IDS = MGMT_PLAN_OPTIONS.map((p) => p.value) as [MgmtPlanId, ...MgmtPlanId[]];
/** מסלולים שאפשר להעניק ידנית (פיילוט/שותפות) — לא "ללא מסלול". */
export const GRANTABLE_MGMT_PLAN_IDS = MGMT_PLAN_IDS.filter((p) => p !== "mgmt_free") as [MgmtPlanId, ...MgmtPlanId[]];

/** תווית לכל מזהה מסלול — של בניין או של חברה. */
export function anyPlanLabel(id: string | null | undefined): string {
  const m = MGMT_PLAN_OPTIONS.find((p) => p.value === id);
  return m ? `ניהול · ${m.label}` : planLabel(id);
}

/** זהה ל-GRACE_DAYS / COMPANY_GRACE_DAYS / COMPANY_EXIT_GRACE_DAYS ב-bloc. */
export const GRACE_DAYS = 7;
export const COMPANY_EXIT_GRACE_DAYS = 14;
