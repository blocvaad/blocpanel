// src/app/api/suppliers/route.ts — ספקים ואימות.
//
// עד עכשיו לא היה מסלול לאמת ספק: bloc שומר בקשת אימות (pending) עם מספר עוסק
// ותעודה, ואף אחד לא סגר אותה — וה-RLS אפשר לספק לסמן את עצמו verified (תוקן
// ב-125). כאן: תור אימות (GET), ואימות / דחייה / הסרת אימות עם סיבה (PATCH).
//
// PANEL-PAY א2 (החלטות 368–369, C2): הפאנל לא כותב ל-supplier_profiles ולא ל-notifications של bloc. הפעולה נחתמת ונשלחת
// ל-bloc (/api/internal/suppliers), שבודק את המצב הנוכחי (verify — מ-pending / rejected; reject — מ-pending; revoke —
// מ-verified; אחר → 409 changed), כותב בתנאי על המצב שנקרא, שולח לספק את ההודעה ורושם ביומן שלו. הרשאה: suppliers.verify
// (admin, superadmin) — כאן ושוב ב-bloc לפי ה-actor; עם קוד אישור (step-up), לפני bloc.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, supplierVerificationSchema } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { actionBadShape, actionFailureAudit, blocActionFailure, supplierRow } from "@/lib/blocActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLUMNS = "id, user_id, business_name, category, phone, email, verification_status, business_license_number, professional_license_url, verification_rejection_reason, verified_at, rating, rating_count, created_at";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const [{ data: suppliers, error }, disputesRes] = await Promise.all([
    adminClient.from("supplier_profiles").select(COLUMNS).order("created_at", { ascending: false }).limit(1000),
    // LEDGER-1b: רשומה שסימון התשלום שלה בוטל (bloc 214) — אין עליה מחלוקת פתוחה.
    adminClient.from("supplier_payments").select("supplier_id").eq("confirmation_status", "disputed").is("reversed_at", null).limit(2000),
  ]);
  if (error) return NextResponse.json({ error: "טעינת ספקים נכשלה" }, { status: 500 });

  // קריאה שנכשלה אינה "אין מחלוקות": open_disputes = null ו-disputes_failed (המסך אומר שלא נטען).
  const disputesFailed = !!disputesRes.error;
  const disputes: Record<string, number> = {};
  for (const d of (disputesRes.data ?? []) as Array<{ supplier_id: string }>) disputes[d.supplier_id] = (disputes[d.supplier_id] ?? 0) + 1;

  const signed = await signLicenses((suppliers ?? []) as Array<{ user_id: string; professional_license_url: string | null }>);
  const rows = (suppliers ?? []).map((s) => ({
    ...s,
    professional_license_url: licenseLink(s as { user_id: string; professional_license_url: string | null }, signed),
    open_disputes: disputesFailed ? null : disputes[s.id] ?? 0,
  }));
  const order = (v: string) => (v === "pending" ? 0 : 1);
  rows.sort((a, b) => order(a.verification_status) - order(b.verification_status));

  const counts: Record<string, number> = { none: 0, pending: 0, verified: 0, rejected: 0 };
  for (const r of rows) counts[r.verification_status] = (counts[r.verification_status] ?? 0) + 1;

  return NextResponse.json({ suppliers: rows, counts, canVerify: ["admin", "superadmin"].includes(g.session.role), ...(disputesFailed ? { disputes_failed: true } : {}) });
}

// 144 (bloc): התעודה נשמרת כ-path ב-bucket הפרטי supplier-verification
// (${user_id}/license_...), לא כקישור חתום לשנה (שהיה קריא לדיירים). כאן חותמים
// קישור קצר (10 דק') לצפייה בפאנל — רק לקובץ שבתיקייה של הספק עצמו: ספק שכתב
// path של ספק אחר לא יקבל כאן קישור לקובץ שלו. קישור ישן (https) מוצג כמו-שהוא.
const LICENSE_BUCKET = "supplier-verification";
const LICENSE_TTL = 60 * 10;
const isPath = (v: string | null | undefined): v is string => !!v && !/^https?:\/\//i.test(v);
const ownPath = (s: { user_id: string; professional_license_url: string | null }) =>
  isPath(s.professional_license_url) && s.professional_license_url.split("/")[0].toLowerCase() === String(s.user_id).toLowerCase();

async function signLicenses(rows: Array<{ user_id: string; professional_license_url: string | null }>): Promise<Map<string, string>> {
  const paths = rows.filter(ownPath).map((r) => r.professional_license_url as string);
  const out = new Map<string, string>();
  if (!paths.length) return out;
  try {
    const { data } = await adminClient.storage.from(LICENSE_BUCKET).createSignedUrls(paths, LICENSE_TTL);
    (data ?? []).forEach((d, i) => { if (d?.signedUrl) out.set(paths[i], d.signedUrl); });
  } catch { /* בלי קישור — הפאנל מציג רק את מספר העוסק */ }
  return out;
}

function licenseLink(s: { user_id: string; professional_license_url: string | null }, signed: Map<string, string>): string | null {
  const v = s.professional_license_url;
  if (!v) return null;
  if (!isPath(v)) return v;
  return ownPath(s) ? signed.get(v) ?? null : null;
}

const AUDIT = { verify: "SUPPLIER_VERIFY", reject: "SUPPLIER_REJECT", revoke: "SUPPLIER_REVOKE" } as const;

export async function PATCH(req: NextRequest) {
  const g = await guard({ permission: "suppliers.verify" });
  if (!g.ok) return g.response;
  const session = g.session;
  const p = await parseBody(req, supplierVerificationSchema);
  if (!p.ok) return p.response;
  // החלטה 369: אימות, דחייה והסרת אימות — אישור בקוד, לפני bloc.
  const su = requireStepUp(session, req);
  if (!su.ok) return su.response;
  const body = p.data;
  const reason = "reason" in body ? body.reason : null;
  const audit = AUDIT[body.action];
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const r = await callBloc("/api/internal/suppliers", {
    actor: actorOf(session), action: body.action, supplier_id: body.id, ...(reason ? { reason } : {}),
  });
  if (!r.ok) {
    const a = actionFailureAudit(r, audit);
    await auditLog(session, a.name, "supplier", body.id, { ...a.meta, reason }, ip);
    const f = blocActionFailure(r, "supplier");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }
  // הצלחה רק עם ok === true ושורת הספק במצב שהפעולה אמורה להביא (verified / rejected) — אחרת "ייתכן שבוצע".
  const row = supplierRow(r.data.supplier, body.action);
  if (r.data.ok !== true || !row || row.id !== body.id) {
    const b = actionBadShape(audit);
    await auditLog(session, b.audit.name, "supplier", body.id, { ...b.audit.meta, reason }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }
  // notified — ההודעה לספק נשמרה ב-bloc (best effort שם; false = הפעולה בוצעה וההודעה לא נשמרה — המסך אומר את זה).
  const notified = typeof r.data.notified === "boolean" ? r.data.notified : null;
  await auditLog(session, audit, "supplier", body.id, { reason, result: row, notified }, ip);
  return NextResponse.json({ ok: true, verification_status: row.verification_status, supplier: row, notified });
}
