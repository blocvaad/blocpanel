// src/app/api/suppliers/route.ts — ספקים ואימות.
//
// עד עכשיו לא היה מסלול לאמת ספק: bloc שומר בקשת אימות (pending) עם מספר עוסק
// ותעודה, ואף אחד לא סגר אותה — וה-RLS אפשר לספק לסמן את עצמו verified (תוקן
// ב-125). כאן: תור אימות, אימות/דחייה/ביטול עם סיבה, יומן והתראה לספק.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, supplierVerificationSchema } from "@/lib/validation";
import { notifyUser } from "@/lib/notify";

export const dynamic = "force-dynamic";

const COLUMNS = "id, user_id, business_name, category, phone, email, verification_status, business_license_number, professional_license_url, verification_rejection_reason, verified_at, rating, rating_count, created_at";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const [{ data: suppliers, error }, disputesRes] = await Promise.all([
    adminClient.from("supplier_profiles").select(COLUMNS).order("created_at", { ascending: false }).limit(1000),
    adminClient.from("supplier_payments").select("supplier_id").eq("confirmation_status", "disputed").limit(2000),
  ]);
  if (error) return NextResponse.json({ error: "טעינת ספקים נכשלה" }, { status: 500 });

  const disputes: Record<string, number> = {};
  for (const d of (disputesRes.data ?? []) as Array<{ supplier_id: string }>) disputes[d.supplier_id] = (disputes[d.supplier_id] ?? 0) + 1;

  const signed = await signLicenses((suppliers ?? []) as Array<{ user_id: string; professional_license_url: string | null }>);
  const rows = (suppliers ?? []).map((s) => ({
    ...s,
    professional_license_url: licenseLink(s as { user_id: string; professional_license_url: string | null }, signed),
    open_disputes: disputes[s.id] ?? 0,
  }));
  const order = (v: string) => (v === "pending" ? 0 : 1);
  rows.sort((a, b) => order(a.verification_status) - order(b.verification_status));

  const counts: Record<string, number> = { none: 0, pending: 0, verified: 0, rejected: 0 };
  for (const r of rows) counts[r.verification_status] = (counts[r.verification_status] ?? 0) + 1;

  return NextResponse.json({ suppliers: rows, counts, canVerify: ["admin", "superadmin"].includes(g.session.role) });
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

const FROM: Record<string, string[]> = { verify: ["pending", "rejected"], reject: ["pending"], revoke: ["verified"] };

export async function PATCH(req: Request) {
  const g = await guard({ permission: "suppliers.verify" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, supplierVerificationSchema);
  if (!p.ok) return p.response;
  const body = p.data;
  const reason = "reason" in body ? body.reason : null;

  const { data: supplier } = await adminClient
    .from("supplier_profiles").select("id, user_id, business_name, verification_status").eq("id", body.id).maybeSingle();
  if (!supplier) return NextResponse.json({ error: "ספק לא נמצא" }, { status: 404 });
  if (!FROM[body.action].includes(supplier.verification_status))
    return NextResponse.json({ error: "מצב האימות השתנה — רעננו", code: "INVALID_STATE" }, { status: 409 });

  const patch = body.action === "verify"
    ? { verification_status: "verified", verified_at: new Date().toISOString(), verified_by: g.session.id, verification_rejection_reason: null }
    : { verification_status: "rejected", verified_at: null, verified_by: g.session.id, verification_rejection_reason: reason };

  // מותנה במצב הנוכחי: שני מנהלים בו-זמנית → אחד מצליח, השני מקבל 409.
  const { data: updated, error } = await adminClient.from("supplier_profiles")
    .update(patch).eq("id", body.id).eq("verification_status", supplier.verification_status).select("id");
  if (error) return NextResponse.json({ error: "העדכון נכשל" }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: "מצב האימות השתנה — רעננו", code: "CONCURRENT_UPDATE" }, { status: 409 });

  await notifyUser(supplier.user_id, {
    title: body.action === "verify" ? "העסק שלך אומת ✓" : body.action === "reject" ? "בקשת האימות לא אושרה" : "תג האימות הוסר",
    content: body.action === "verify" ? "תג \"ספק מאומת\" מוצג עכשיו לוועדים." : reason ?? "",
    link: "/supplier/dashboard",
  });
  await auditLog(g.session, `SUPPLIER_${body.action.toUpperCase()}`, "supplier", body.id,
    { business_name: supplier.business_name, from: supplier.verification_status, reason },
    req.headers.get("x-forwarded-for") ?? undefined);

  return NextResponse.json({ ok: true, verification_status: patch.verification_status });
}
