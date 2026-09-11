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
