import { z } from "zod";
import { PLAN_IDS, GRANTABLE_MGMT_PLAN_IDS } from "./plans";
import { DURATION_KEYS } from "./broadcasts";
import { checkNote } from "./encryptionKeys";
import { AD_FORMATS, AD_THEMES, BANNER_POSITIONS, FORMAT_INFO, contrastInfo } from "./adsFormats";

// Centralized input schemas for privileged panel mutations (audit P0.8).
// Every mutation validates its body through one of these before touching the
// DB. This is an allowlist: unknown/forbidden fields (id, invite_code,
// is_active, timestamps, …) are stripped, never written. `.strict()` rejects
// any key not declared here so a caller can't smuggle extra columns.

// ── Buildings ──
// PANEL-PAY א1 (החלטה 363): המסלול לא נערך יותר בעריכת בניין ולא ביצירה. "מסלול בלי חיוב" (הענקה / סיום) הוא פעולה
// נפרדת של סופר-אדמין, מכרטיס בדף הבניין (buildingPlanActionSchema, דרך bloc). plan / comp_reason / plan_expires כאן —
// נדחים (strict); ה-routes עונים עליהם בהודעה שאומרת לאן זה עבר (lib/buildingPlan PLAN_MOVED_TEXT). בניין חדש — במסלול
// ברירת המחדל של ה-DB.
// PANEL-PAY א2 (C1): expected — הפרטים כפי שהמסך טען אותם. bloc עונה 409 changed אם הבניין השתנה בינתיים (אין updated_at
// בבניין) — שני אנשי צוות שעורכים יחד לא דורסים זה את זה בשקט.
const BuildingEditExpected = z.object({
  name: z.string().max(200).optional(),
  address: z.string().max(400).nullable().optional(),
  max_tenants: z.number().int().nullable().optional(),
}).strict();
export const buildingUpdateSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(200, "השם ארוך מדי (עד 200 תווים)").optional(),
  address: z.string().max(400).optional(),
  max_tenants: z.number().int().positive().max(100000).optional(),
  expected: BuildingEditExpected.optional(),
}).strict();

export const buildingCreateSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  max_tenants: z.coerce.number().int().positive().max(100000).optional(),
  admin_email: z.string().trim().email("כתובת המייל של ראש הוועד לא תקינה").max(200, "כתובת המייל של ראש הוועד ארוכה מדי (עד 200 תווים)").optional(),
  admin_name: z.string().max(200).optional(),
}).strict();

// מסלול לבניין בלי חיוב (PANEL-PAY א1, החלטה 363, C1) — סופר-אדמין, עם אישור בקוד (step-up). מזהי החבילות = של bloc
// (lib/plans), חוץ מ-free. הסיבה חובה בהענקה (3–300 אחרי trim, buildings.comp_reason, 074). expected_plan — המסלול שהמסך
// הראה: bloc עונה 409 changed אם הוא כבר אחר.
const GrantablePlan = z.enum(PLAN_IDS, { errorMap: () => ({ message: "מסלול לא מוכר" }) }).refine((p) => p !== "free", { message: "בחרו מסלול (לא \"ללא מסלול\")" });
const CompReason = z.string({ required_error: "כתבו סיבה (למשל: בניין בדיקות, פיילוט)" }).trim()
  .min(3, "כתבו סיבה (3 תווים לפחות, למשל: בניין בדיקות, פיילוט)").max(300, "הסיבה ארוכה מדי (עד 300 תווים)");
const ExpectedPlan = z.string().trim().min(1).max(40).optional();
export const buildingPlanActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), plan: GrantablePlan, comp_reason: CompReason, expected_plan: ExpectedPlan }).strict(),
  z.object({ action: z.literal("end_grant"), expected_plan: ExpectedPlan }).strict(),
]);
export type BuildingPlanAction = z.infer<typeof buildingPlanActionSchema>;

// אישור לפעולת כסף (PANEL-PAY א1, החלטה 364, C4): שליחת קוד למייל / אימות הקוד.
export const stepUpActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }).strict(),
  z.object({ action: z.literal("verify"), code: z.string().trim().regex(/^\d{6}$/, "הקוד הוא 6 ספרות") }).strict(),
]);

// BILL-1b (החלטה 319): אישור מפורש להשעיה / ארכוב של בניין עם מנוי חי. נשלח רק אחרי 409 LIVE_SUBSCRIPTION.
const ConfirmLive = z.literal(true).optional();

export const buildingArchiveSchema = z.object({
  reason: z.string().max(1000).optional(),
  confirm_live_subscription: ConfirmLive,
}).strict();

// השעיה / הפעלה — פעולה נפרדת מעריכת פרטים (הדיירים נחסמים מיד ב-bloc: proxy בודק buildings.is_active).
// קודם המסך שלח { is_active } ל-buildingUpdateSchema, שדוחה אותו (strict) — וההשעיה לא קרתה אף פעם.
export const buildingSuspendSchema = z.object({
  is_active: z.boolean(),
  reason: z.string().trim().max(300).optional(),
  confirm_live_subscription: ConfirmLive,
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

// ── Management companies (bloc REG-2) ──
// ההחלטה עוברת ל-bloc (/api/internal/management-companies, SQL 187): על המצב שצוות bloc ראה (expected_status),
// ובאישור ובדחייה — גם על הפרטים שנראו (seen_details_at). סיבה לחברה — חובה בדחייה ובהשעיה (נשלחת לבעלים).
// note — תיעוד פנימי (מה נבדק), לא נשלח לחברה.
const CompanyId = z.string().uuid();
const ExpectedStatus = z.enum(["pending_approval", "active", "rejected", "suspended"]);
const SeenDetailsAt = z.string({ required_error: "חסר המועד שבו פרטי הבקשה נבדקו. רעננו את הרשימה." })
  .datetime({ offset: true, message: "מועד לא תקין. רעננו את הרשימה." }).nullable();
const COMPANY_REASON = "כתבו לחברה את הסיבה (10 תווים לפחות)";
// תווים כמו ב-bloc וב-SQL 187 (char_length), לא יחידות UTF-16: אימוג'י אחד הוא תו אחד.
const chars = (s: string) => [...s].length;
const CompanyReason = z.string({ required_error: COMPANY_REASON }).trim()
  .refine((s) => chars(s) >= 10, COMPANY_REASON).refine((s) => chars(s) <= 1000, "הסיבה ארוכה מדי (עד 1,000 תווים)");
const CompanyNote = z.string().trim().max(1000, "התיעוד ארוך מדי (עד 1,000 תווים)").optional();
export const managementActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), id: CompanyId, expected_status: ExpectedStatus, seen_details_at: SeenDetailsAt, note: CompanyNote }).strict(),
  z.object({ action: z.literal("reject"), id: CompanyId, expected_status: ExpectedStatus, seen_details_at: SeenDetailsAt, reason: CompanyReason, note: CompanyNote }).strict(),
  z.object({ action: z.literal("suspend"), id: CompanyId, expected_status: ExpectedStatus, reason: CompanyReason, note: CompanyNote, confirm_live_subscription: ConfirmLive }).strict(),
  z.object({ action: z.literal("reactivate"), id: CompanyId, expected_status: ExpectedStatus, note: CompanyNote }).strict(),
]);

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

// ── ספקי הסליקה שמוצעים לוועדים (bloc PAY-M, SQL 202, superadmin) ──
export const collectionProviderSchema = z.union([
  z.object({
    provider: z.enum(["payplus", "cardcom", "grow", "management"]),
    offered: z.boolean(),
  }).strict(),
  // PAY-1b (SQL 225, G14): תיעוד סגירת שער ופתיחה מחדש — רק לספקי אשראי.
  z.object({
    action: z.literal("close_gate"),
    provider: z.enum(["payplus", "cardcom", "grow"]),
    evidence: z.string().trim().min(10, "צריך להסביר בלפחות 10 תווים איך השער נסגר.").max(1000, "ההסבר ארוך מדי (עד 1000 תווים)."),
  }).strict(),
  z.object({
    action: z.literal("reopen_gate"),
    provider: z.enum(["payplus", "cardcom", "grow"]),
  }).strict(),
]);

// ── מפתחות הצפנה (bloc KEYS-1, security.manage) ──
// ריצת ניסיון / הצפנה מחדש. strict: השחקן נקבע מהסשן בשרת (שדה actor, גודל סבב או dryRun מהדפדפן — נדחים). ההערה:
// חובה (10+ תווים) בהצפנה מחדש, רשות בניסיון, עד 500, בלי מפתח מודבק (lib/encryptionKeys.checkNote — אותו כלל בכרטיס).
// payment עובר את הסכמה בכוונה: ה-route עונה 409 payment_not_movable בעברית, לפני שפונים ל-bloc.
// dryRunToken (C5): האישור של ריצת הניסיון. כאן רק מחרוזת עד 300; החובה (בהצפנה מחדש) והצורה נבדקות ב-route — 400 עם
// הקוד dry_run_required, שהכרטיס מבחין בו משגיאת הערה.
export const keysActionSchema = z
  .object({
    action: z.enum(["dry_run", "reencrypt"]),
    kind: z.enum(["supplier_bank", "payment"]),
    note: z.string().max(4000).optional(),
    dryRunToken: z.string().max(300).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const n = checkNote(d.note, d.action === "reencrypt" && d.kind !== "payment");
    if (!n.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: n.error });
  })
  .transform((d) => ({ action: d.action, kind: d.kind, note: d.note?.trim() || undefined, dryRunToken: d.dryRunToken?.trim() || undefined }));
export type KeysAction = z.infer<typeof keysActionSchema>;

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
/** ADS-2א v2: צבע "#RRGGBB" (ריק / null — אין צבע משלכם). */
const adOptHex = (what: string) => z.union([z.literal(""), z.null(), z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, `${what}: צבע בצורה #RRGGBB`)])
  .optional().transform((v) => (v ? v.toUpperCase() : null));
/** נקודת המיקוד: 0..1. */
const adFocal = (what: string) => z.number({ invalid_type_error: `${what}: מספר בין 0 ל-1` }).min(0, `${what}: מספר בין 0 ל-1`).max(1, `${what}: מספר בין 0 ל-1`);

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
  // ADS-2א v2 (החלטה 7 בתוכנית): הלוגו (רק מהבאקט של bloc — bloc בודק) וצבע המותג (ברירת המחדל לצבע הכפתור).
  logo_url: adOptHttps("הלוגו"),
  brand_color: adOptHex("צבע המותג"),
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

// ADS-2א (החלטה 380, C5 v2): תמונה בסטורי / בקרוסלה — אותם גבולות כמו ad_frames_ok. כיתוב / קישור / מיקוד ריקים לא נשלחים
// (לא null); focal — [x, y] בין 0 ל-1.
const adFrame = z.object({
  image_url: adHttps("התמונה"),
  image_alt: adText(2, 200, "תיאור התמונה"),
  caption: adOpt(60, "הכיתוב"),
  cta_url: adOptHttps("הקישור"),
  focal: z.tuple([adFocal("נקודת המיקוד"), adFocal("נקודת המיקוד")], { invalid_type_error: "נקודת המיקוד: שני מספרים בין 0 ל-1" }).nullable().optional(),
}).strict().transform((f) => ({
  image_url: f.image_url, image_alt: f.image_alt,
  ...(f.caption ? { caption: f.caption } : {}),
  ...(f.cta_url ? { cta_url: f.cta_url } : {}),
  ...(f.focal ? { focal: f.focal } : {}),
}));
type AdFrameOut = z.output<typeof adFrame>;
/** 2 עד 5 תמונות; שגיאה בתמונה — עם המספר שלה ("תמונה 3 — …"), ובנתיב frames.N.שדה. */
const adFrames = z.array(z.unknown(), { invalid_type_error: "התמונות: רשימה לא תקינה" })
  .min(2, "סטורי וקרוסלה: לפחות 2 תמונות").max(5, "סטורי וקרוסלה: עד 5 תמונות")
  .transform((list, ctx): AdFrameOut[] => {
    const out: AdFrameOut[] = [];
    let bad = false;
    list.forEach((raw, i) => {
      const r = adFrame.safeParse(raw);
      if (r.success) { out.push(r.data); return; }
      bad = true;
      for (const iss of r.error.issues) {
        const text = iss.code === z.ZodIssueCode.unrecognized_keys ? "שדה לא מוכר" : /[֐-׿]/.test(iss.message) ? iss.message : "ערך לא תקין";
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `תמונה ${i + 1} — ${text}`, path: [i, ...iss.path] });
      }
    });
    return bad ? z.NEVER : out;
  });

export const adCreativeFields = z.object({
  campaign_id: adId,
  image_url: adHttps("התמונה"),
  image_alt: adText(2, 200, "תיאור התמונה"),
  headline: adText(2, 60, "הכותרת"),
  body: adOpt(180, "המשפט"),
  cta_label: adText(2, 24, "הכפתור"),
  cta_url: adHttps("הקישור"),
  // ADS-2א v2 (C5 v2): הפורמט שייך למודעה (חסר — bloc: card); מיקום — רק בפס; בהיר / כהה (חסר — light); צבע הכפתור (null —
  // הצבע של bloc); נקודת המיקוד (חסר — 0.5); תמונות — רק בסטורי / קרוסלה. ההתאמה פנימית למודעה (הבדיקות למטה, כמו ה-CHECK).
  format: z.enum(AD_FORMATS, { errorMap: () => ({ message: "בחרו פורמט למודעה" }) }).optional(),
  banner_position: z.enum(BANNER_POSITIONS, { errorMap: () => ({ message: "מיקום הפס: למעלה או למטה" }) }).nullable().optional(),
  theme: z.enum(AD_THEMES, { errorMap: () => ({ message: "סגנון: בהיר או כהה" }) }).optional(),
  accent: adOptHex("צבע הכפתור"),
  focal_x: adFocal("נקודת המיקוד").optional(),
  focal_y: adFocal("נקודת המיקוד").optional(),
  frames: adFrames.nullable().optional(),
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
  if (b.action === "creative.save") {
    // ADS-2א v2: ההתאמה פנימית למודעה (כמו ה-CHECK של SQL 228; פורמט חסר = card).
    const format = b.format ?? "card";
    if ((format === "banner") !== (b.banner_position != null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ["banner_position"],
        message: format === "banner" ? "בחרו איפה הפס מוצג: למעלה או למטה" : "מיקום יש רק לפס",
      });
    const multi = FORMAT_INFO[format].frames;
    if (multi !== (b.frames != null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ["frames"],
        message: multi ? "סטורי וקרוסלה: לפחות 2 תמונות" : "תמונות נוספות יש רק בסטורי ובקרוסלה",
      });
    // סקירה #9 — כמו ב-bloc (400 invalid, field accent): צבע שהטקסט עליו לא מגיע ל-4.5:1 בשום צבע טקסט לא נשמר
    if (typeof b.accent === "string" && b.accent && !contrastInfo(b.accent).ok)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accent"], message: "צבע הכפתור לא קריא (ניגודיות מתחת ל-4.5:1 גם עם טקסט לבן וגם עם כהה) — בחרו צבע כהה או בהיר יותר" });
    // רשימה שנכשלה (תמונה לא תקינה) מגיעה לכאן בלי ערך (z.NEVER) — הבדיקה רק על רשימה אמיתית, אחרת היא הייתה זורקת
    if (format !== "carousel" && Array.isArray(b.frames)) b.frames.forEach((f, i) => {
      if (f && f.cta_url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", i, "cta_url"], message: `תמונה ${i + 1} — קישור לכל תמונה יש רק בקרוסלה` });
    });
  }
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
