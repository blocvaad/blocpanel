// src/app/api/home-studio/upload/route.ts — תמונה לכרטיס במסך הבית (bloc HOME-STUDIO-1, החלטה 691): לבאקט הציבורי 'ads' של bloc,
// תחת studio/<חודש>/ — בדיוק כמו תמונה של פרסומת (api/ads/upload): הסוג נקבע לפי הבייטים (JPEG / PNG / WebP), עד 2MB; bloc נותן
// כתובת העלאה חתומה (image.upload_url, בודק שוב ובונה את הנתיב), הפאנל שולח אליה את הבייטים ב-PUT ומחזיר את הכתובת הציבורית —
// רק היא נשמרת בכרטיס (bloc מקבל בכרטיס רק תמונה מהבאקט שלו). home_studio.manage.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { sniffImage, AD_IMAGE_MAX_BYTES } from "@/lib/ads";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { actionBadShape } from "@/lib/blocActions";
import { adsFailureAudit, uploadTarget, uploadUrlFailure, UPLOAD_BAD_SHAPE_TEXT } from "@/lib/adsActions";
import { putSignedImage } from "@/lib/adsUpload";
import { UPLOAD_FAILED_TEXT } from "@/lib/adsUi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const bad = (error: string, status: number, code?: string) =>
  NextResponse.json(code ? { error, code } : { error }, { status, headers: noStore });

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "home_studio.manage" });
  if (!g.ok) return g.response;
  const session = g.session;
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  let form: FormData;
  try { form = await req.formData(); } catch { return bad("בחרו קובץ תמונה", 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return bad("בחרו קובץ תמונה", 400);
  const blob = file as Blob;
  if (blob.size === 0) return bad("הקובץ ריק", 400);
  if (blob.size > AD_IMAGE_MAX_BYTES) return bad("התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב.", 413);

  const buf = await blob.arrayBuffer();
  const kind = sniffImage(new Uint8Array(buf));
  if (!kind) return bad("אפשר להעלות רק JPEG, PNG או WebP.", 415);
  const facts = { bytes: buf.byteLength, type: kind.type };

  // 1. כתובת חתומה מ-bloc
  const r = await callBloc("/api/internal/home-studio", { actor: actorOf(session), action: "image.upload_url", type: kind.type, bytes: buf.byteLength });
  if (!r.ok) {
    const a = adsFailureAudit(r, "HOME_STUDIO_IMAGE");
    await auditLog(session, a.name, "home_studio_image", undefined, { ...a.meta, ...facts }, ip);
    const f = uploadUrlFailure(r);
    return bad(f.error, f.status, f.code);
  }
  const target = uploadTarget(r.data);
  // רק נתיב של הסטודיו (studio/…) — לא כתובת של פרסומת או של מקום אחר בבאקט
  if (!target || !target.path.startsWith("studio/") || !target.public_url.includes("/storage/v1/object/public/ads/studio/")) {
    const b = actionBadShape("HOME_STUDIO_IMAGE");
    await auditLog(session, b.audit.name, "home_studio_image", undefined, { ...b.audit.meta, ...facts }, ip);
    return bad(UPLOAD_BAD_SHAPE_TEXT, 502, "bad_shape");
  }

  // 2. הבייטים — ישר לאחסון, בכתובת החתומה (לא נרשמת: יש בה טוקן)
  const put = await putSignedImage(target.signed_url, buf, kind.type, { anonKey: target.anon_key });
  if (!put.ok) {
    console.error("[home-studio upload] PUT to the signed URL failed", put.code, put.status);
    return bad(UPLOAD_FAILED_TEXT, 502, put.code);
  }
  await auditLog(session, "HOME_STUDIO_IMAGE", "home_studio_image", target.path, facts, ip);
  return NextResponse.json({ ok: true, url: target.public_url }, { headers: noStore });
}
