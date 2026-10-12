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

// ── Tenants ──
export const tenantUpdateSchema = z.object({
  approval_status: z.enum(["pending", "approved", "blocked", "rejected"]).optional(),
  role: z.enum(["tenant", "admin", "management"]).optional(),
  floor: z.union([z.number(), z.string()]).optional(),
}).strict();

export const tenantTransferSchema = z.object({
  tenant_id: z.string().uuid(),
  to_building_id: z.string().uuid(),
  new_apartment: z.string().max(40).optional(),
}).strict();

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
    const field = first?.path.join(".") || "";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `שדה לא תקין${field ? `: ${field}` : ""}`, issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
