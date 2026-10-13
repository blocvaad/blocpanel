import { z } from "zod";
import { PLAN_IDS, GRANTABLE_MGMT_PLAN_IDS } from "./plans";
import { DURATION_KEYS } from "./broadcasts";

// Centralized input schemas for privileged panel mutations (audit P0.8).
// Every mutation validates its body through one of these before touching the
// DB. This is an allowlist: unknown/forbidden fields (id, invite_code,
// is_active, timestamps, …) are stripped, never written. `.strict()` rejects
// any key not declared here so a caller can't smuggle extra columns.

// ── Buildings ──
// חבילה בתשלום שניתנת ידנית (בלי חיוב PayPlus) = "מנוי ללא תשלום" — חייבת סיבה
// מתועדת (buildings.comp_reason, 074). מזהי החבילות = אלה של bloc (lib/plans.ts).
const compReason = z.string().trim().min(3).max(300);
const needsCompReason = (b: { plan?: string; comp_reason?: string }) =>
  !b.plan || b.plan === "free" || !!b.comp_reason;
const compReasonIssue = { message: "חבילה בתשלום בלי חיוב דורשת סיבה (למשל: בניין בדיקות, פיילוט)", path: ["comp_reason"] };

export const buildingUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(400).optional(),
  max_tenants: z.number().int().positive().max(100000).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  comp_reason: compReason.optional(),
}).strict().refine(needsCompReason, compReasonIssue);

export const buildingCreateSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  max_tenants: z.coerce.number().int().positive().max(100000).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  comp_reason: compReason.optional(),
  admin_email: z.string().email().optional(),
  admin_name: z.string().max(200).optional(),
}).strict().refine(needsCompReason, compReasonIssue);

export const buildingArchiveSchema = z.object({
  reason: z.string().max(1000).optional(),
}).strict();

// השעיה / הפעלה — פעולה נפרדת מעריכת פרטים (הדיירים נחסמים מיד ב-bloc: proxy בודק buildings.is_active).
// קודם המסך שלח { is_active } ל-buildingUpdateSchema, שדוחה אותו (strict) — וההשעיה לא קרתה אף פעם.
export const buildingSuspendSchema = z.object({
  is_active: z.boolean(),
  reason: z.string().trim().max(300).optional(),
}).strict();

// ── חברים בבניין וחשבון (bloc UI-R5c-1) ──
// הפאנל לא כותב יותר ל-profiles (approval_status / role / building_id): כל שינוי נשלח חתום ל-bloc
// (/api/internal/members), שמריץ את אותו מסלול כמו באפליקציה — מכסת המסלול, כללי הוועד, התראות, יומן.
// תיעוד חובה בכל פעולה שמוציאה מישהו או משנה סמכות. אותם גבולות כמו ב-bloc.
const MNote = z.string().trim().min(10, "כתבו בתיעוד מה אומת ואיך (10 תווים לפחות)").max(1000, "התיעוד ארוך מדי (עד 1,000 תווים)");
const MOptNote = z.string().trim().max(1000, "התיעוד ארוך מדי (עד 1,000 תווים)").optional().nullable();
const MId = z.string().uuid("מזהה לא תקין");
const MApartment = z.string().trim().max(20, "מספר הדירה ארוך מדי (עד 20 תווים)").nullable();
const MFloor = z.string().trim().max(10, "הקומה ארוכה מדי (עד 10 תווים)").nullable();

export const memberActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), building_id: MId, user_id: MId, panel_note: MOptNote }).strict(),
  z.object({ action: z.literal("reject"),  building_id: MId, user_id: MId, panel_note: MNote }).strict(),
  z.object({ action: z.literal("remove"),  building_id: MId, user_id: MId, panel_note: MNote, confirm: z.literal(true, { errorMap: () => ({ message: "צריך לאשר את ההסרה" }) }) }).strict(),
  z.object({ action: z.literal("set_role"), building_id: MId, user_id: MId, role: z.enum(["admin", "tenant"]), panel_note: MNote }).strict(),
  z.object({ action: z.literal("set_apartment"), building_id: MId, user_id: MId, apartment: MApartment, floor: MFloor, panel_note: MOptNote }).strict(),
  z.object({
    action: z.literal("transfer"), user_id: MId, from_building_id: MId, to_building_id: MId,
    apartment: MApartment.optional(), floor: MFloor.optional(), approve: z.boolean().default(false), panel_note: MNote,
  }).strict(),
  z.object({ action: z.literal("block"), user_id: MId, reason: z.string().trim().min(3, "כתבו סיבה (3 תווים לפחות)").max(500, "הסיבה ארוכה מדי (עד 500 תווים)"), panel_note: MOptNote, confirm: z.literal(true, { errorMap: () => ({ message: "צריך לאשר את החסימה" }) }) }).strict(),
  z.object({ action: z.literal("unblock"), user_id: MId, panel_note: MNote }).strict(),
]);
export type MemberAction = z.infer<typeof memberActionSchema>;

// ── Panel admins ──
export const adminUpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(["superadmin", "admin", "viewer"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
}).strict();

export const adminCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["superadmin", "admin", "viewer"]),
}).strict();

// ── Management companies ──
export const managementActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "suspend", "reactivate"]),
  reason: z.string().max(1000).optional(),
}).strict();

// ── Management company plan grant (superadmin) ──
// מסלול לחברה בלי חיוב (פיילוט / שותפות) — תמיד עם סיבה מתועדת, כמו בבניינים.
export const companyGrantSchema = z.union([
  z.object({
    id: z.string().uuid(),
    action: z.literal("grant"),
    plan: z.enum(GRANTABLE_MGMT_PLAN_IDS),
    reason: z.string().trim().min(3).max(300),
  }).strict(),
  z.object({
    id: z.string().uuid(),
    action: z.literal("end_grant"),
  }).strict(),
]);

// ── AI credits gift (bloc AI-1, superadmin) ──
// קרדיטים ל-AI במתנה לבניין (ai_topup_grant, 173): כמה, לכמה חודשים, ולמה — הסיבה נשמרת בהזמנה וביומן.
export const aiGrantSchema = z.object({
  units: z.coerce.number().int("מספר שלם של קרדיטים").min(1, "לפחות קרדיט אחד").max(100000, "עד 100,000 קרדיטים בפעם"),
  months: z.coerce.number().int().min(1, "לפחות חודש").max(24, "עד 24 חודשים").default(12),
  note: z.string().trim().min(3, "כתבו למה (למשל: פיצוי על תקלה, פיילוט)").max(500),
}).strict();

// ── Supplier verification ──
export const supplierVerificationSchema = z.union([
  z.object({ id: z.string().uuid(), action: z.literal("verify") }).strict(),
  z.object({ id: z.string().uuid(), action: z.literal("reject"), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ id: z.string().uuid(), action: z.literal("revoke"), reason: z.string().trim().min(3).max(500) }).strict(),
]);

// ── המשכיות ועד (bloc 133/134) — פעולות צוות; כל אחת עם תיעוד ──
const Note = z.string().trim().min(10, "תיעוד: לפחות 10 תווים — מה אומת ואיך").max(1000);
export const committeeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"), building_id: z.string().uuid(), user_id: z.string().uuid(),
    reason: z.enum(["deceased", "unavailable", "other"]), note: z.string().trim().max(500).optional().nullable(),
    panel_note: Note, confirm: z.literal(true),
  }).strict(),
  z.object({ action: z.literal("execute"), request_id: z.string().uuid(), panel_note: Note, confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal("cancel"),  request_id: z.string().uuid(), panel_note: Note }).strict(),
  z.object({ action: z.literal("extend"),  request_id: z.string().uuid(), panel_note: Note, until: z.string().datetime({ offset: true }) }).strict(),
]);

// ── Broadcast (bloc UI-R5a) — השליחה והניהול רצים ב-bloc (/api/internal/broadcast) ──
// אותם גבולות כמו ב-bloc: כותרת עד 200, תוכן עד 3,000, עד 365 ימים. התוקף נקבע בשרת מתוך "כמה זמן"
// (duration + date); expires_at מפורש — רק בהמשך של אותה שליחה (שיגיע לכל הבניינים עם אותו תאריך).
const bTitle = z.string().trim().min(1, "כתבו כותרת").max(200, "כותרת עד 200 תווים");
const bContent = z.string().trim().min(1, "כתבו את ההודעה").max(3000, "הודעה עד 3,000 תווים");
const bPriority = z.enum(["low", "normal", "high", "urgent"]);
const bDuration = z.enum(DURATION_KEYS);
const bDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין");
const bTarget = {
  broadcast_id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).min(1).max(5000).optional(),
};
const oneTarget = (b: { broadcast_id?: string; ids?: string[] }) => !!b.broadcast_id !== !!b.ids;
const oneTargetIssue = { message: "צריך מזהה שידור או רשימת הודעות (אחד מהם)", path: ["broadcast_id"] };

export const broadcastSchema = z.object({
  broadcast_id: z.string().uuid(),
  title: bTitle,
  content: bContent,
  priority: bPriority.default("normal"),
  /** בניינים מסוימים; חסר — כל הבניינים הפעילים. */
  building_ids: z.array(z.string().uuid()).min(1).max(5000).optional(),
  duration: bDuration.optional(),
  date: bDate.optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  requires_ack: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
}).strict().refine((b) => b.duration !== undefined || b.expires_at !== undefined, { message: "בחרו כמה זמן ההודעה תוצג", path: ["duration"] });

export const broadcastManageSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("end"), ...bTarget }).strict(),
  z.object({
    action: z.literal("update"), ...bTarget,
    title: bTitle.optional(),
    content: bContent.optional(),
    priority: bPriority.optional(),
    duration: bDuration.optional(),
    date: bDate.optional(),
    requires_ack: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
  }).strict(),
]).refine(oneTarget, oneTargetIssue);

export const broadcastDeleteSchema = z.object({
  ...bTarget,
  confirm: z.literal(true),
}).strict().refine(oneTarget, oneTargetIssue);

// ── פרסומות ממומנות (bloc ADS-1, SQL 175) ──
// אותם גבולות כמו ה-CHECK ב-DB, עם משפט בעברית לכל שדה. כתובות — https בלבד. ריק = null.
const adText = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what}: לפחות ${min} תווים`).max(max, `${what}: עד ${max} תווים`);
const adOpt = (max: number, what: string) =>
  z.string().trim().max(max, `${what}: עד ${max} תווים`).optional().nullable().transform((v) => (v ? v : null));
const adHttps = (what: string) => z.string().trim().max(1000, `${what}: עד 1,000 תווים`)
  .refine((v) => { try { const u = new URL(v); return u.protocol === "https:" && !!u.hostname && !u.username && !/\s/.test(v); } catch { return false; } },
    `${what}: כתובת מלאה שמתחילה ב-https://`);
const adOptHttps = (what: string) => z.union([z.literal(""), z.null(), adHttps(what)]).optional().transform((v) => (v ? v : null));
const adDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "תאריך לא תקין");
const adId = z.string().uuid("מזהה לא תקין");
const adDatesOk = (o: { starts_on: string; ends_on: string }) => o.ends_on >= o.starts_on;
const adDatesIssue = { message: "תאריך הסיום לפני תאריך ההתחלה", path: ["ends_on"] };
const adSubset = <T extends string>(all: readonly [T, ...T[]], what: string) =>
  z.array(z.enum(all)).min(1, `בחרו לפחות ${what} אחד`).transform((a) => [...new Set(a)]);

export const adAdvertiserFields = z.object({
  name: adText(2, 80, "שם המפרסם"),
  legal_name: adOpt(160, "השם הרשמי"),
  business_id: z.string().trim().max(20).optional().nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || v === "" || /^[0-9]{5,12}$/.test(v), "ח.פ / ע.מ: 5 עד 12 ספרות")
    .transform((v) => (v ? v : null)),
  contact_name: adOpt(120, "איש הקשר"),
  contact_phone: adOpt(30, "הטלפון"),
  contact_email: z.union([z.literal(""), z.null(), z.string().trim().email("אימייל לא תקין").max(200)]).optional().transform((v) => (v ? v : null)),
  website: adOptHttps("האתר"),
  notes: adOpt(2000, "הערות"),
});

export const adContractFields = z.object({
  advertiser_id: adId,
  reference: adOpt(60, "מספר החוזה"),
  pricing: z.enum(["cpm", "cpc", "flat"], { errorMap: () => ({ message: "בחרו מודל תמחור" }) }),
  price_ils: z.coerce.number({ invalid_type_error: "מחיר לא תקין" }).min(0, "המחיר לא יכול להיות שלילי").max(10_000_000, "המחיר גבוה מדי")
    .transform((v) => Math.round(v * 100) / 100),
  impression_cap: z.coerce.number().int("מספר שלם").min(1, "לפחות חשיפה אחת").max(100_000_000).nullable().optional().transform((v) => v ?? null),
  starts_on: adDate,
  ends_on: adDate,
  status: z.enum(["draft", "active", "cancelled"]).default("draft"),
  document_url: adOptHttps("קישור לחוזה"),
  notes: adOpt(2000, "הערות"),
});

export const adCampaignFields = z.object({
  contract_id: adId,
  name: adText(2, 80, "שם הקמפיין"),
  starts_on: adDate,
  ends_on: adDate,
  days: z.array(z.number().int().min(0).max(6)).min(1, "בחרו לפחות יום אחד").max(7).transform((a) => [...new Set(a)].sort()),
  hour_from: z.number().int().min(0).max(23),
  hour_to: z.number().int().min(1).max(24),
  screens: adSubset(["home", "market", "events"] as const, "מסך"),
  goal_views: z.number().int("מספר שלם").min(1, "יעד של חשיפה אחת לפחות").max(100_000_000).nullable(),
  daily_cap: z.number().int("מספר שלם").min(1).max(10_000_000).nullable(),
  per_user_cap: z.number().int().min(1, "לפחות פעם אחת").max(30, "עד 30 פעמים לאדם"),
  plans: adSubset(["free", "building", "large", "tower", "company"] as const, "מסלול"),
  roles: adSubset(["tenant", "committee"] as const, "קהל"),
  cities: z.array(z.string().trim().min(1).max(60)).max(50, "עד 50 ערים").transform((a) => [...new Set(a)]),
  building_ids: z.array(adId).max(500, "עד 500 בניינים").transform((a) => [...new Set(a)]),
  weight: z.number().int().min(1).max(10),
});

export const adCreativeFields = z.object({
  campaign_id: adId,
  image_url: adHttps("התמונה"),
  image_alt: adText(2, 200, "תיאור התמונה"),
  headline: adText(2, 60, "הכותרת"),
  body: adOpt(180, "המשפט"),
  cta_label: adText(2, 24, "הכפתור"),
  cta_url: adHttps("הקישור"),
});

export const adActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advertiser.save"), id: adId.optional() }).merge(adAdvertiserFields).strict(),
  z.object({ action: z.literal("advertiser.archive"), id: adId, archived: z.boolean() }).strict(),
  z.object({ action: z.literal("advertiser.delete"), id: adId }).strict(),
  z.object({ action: z.literal("contract.save"), id: adId.optional() }).merge(adContractFields).strict(),
  z.object({ action: z.literal("contract.delete"), id: adId }).strict(),
  z.object({ action: z.literal("campaign.save"), id: adId.optional() }).merge(adCampaignFields).strict(),
  z.object({ action: z.literal("campaign.status"), id: adId, status: z.enum(["draft", "active", "paused", "ended"]) }).strict(),
  z.object({ action: z.literal("campaign.duplicate"), id: adId }).strict(),
  z.object({ action: z.literal("campaign.delete"), id: adId }).strict(),
  z.object({ action: z.literal("creative.save"), id: adId.optional() }).merge(adCreativeFields).strict(),
  z.object({ action: z.literal("creative.active"), id: adId, active: z.boolean() }).strict(),
  z.object({ action: z.literal("creative.delete"), id: adId }).strict(),
  z.object({
    action: z.literal("settings.save"),
    enabled: z.boolean().optional(),
    excluded_buildings: z.array(adId).max(1000).optional(),
    tester_emails: z.array(z.string().trim().toLowerCase().email("אימייל לא תקין")).max(20, "עד 20 מכשירי בדיקה").optional(),
  }).strict(),
]).superRefine((b, ctx) => {
  if ((b.action === "contract.save" || b.action === "campaign.save") && !adDatesOk(b))
    ctx.addIssue({ code: z.ZodIssueCode.custom, ...adDatesIssue });
  if (b.action === "campaign.save" && b.hour_to <= b.hour_from)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "שעת הסיום צריכה להיות אחרי שעת ההתחלה", path: ["hour_to"] });
});
export type AdAction = z.infer<typeof adActionSchema>;

// ── Helper: parse a request body, returning either the typed data or a
//    ready-to-return 400 with the validation errors. ──
import { NextResponse } from "next/server";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseBody<T>(
  req: { json: () => Promise<unknown> },
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    // הודעה בעברית מהסכמה ("כתבו סיבה…") — כמו שהיא; אחרת ההודעה הכללית (בלי שם שדה באנגלית).
    const hebrew = /[\u0590-\u05FF]/.test(first?.message ?? "");
    return {
      ok: false,
      response: NextResponse.json(
        { error: hebrew ? first.message : "שדה לא תקין", issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
