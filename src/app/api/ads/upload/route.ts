// src/app/api/ads/upload/route.ts — תמונה לפרסומת (bloc ADS-1): לבאקט הציבורי 'ads' (SQL 175), דרך service role.
//
// הסוג נקבע לפי הבייטים עצמם (JPEG / PNG / WebP), לא לפי שם הקובץ או מה שהדפדפן אמר; עד 2MB (גם הבאקט
// מגביל). שם הקובץ — מזהה אקראי, בתיקייה של החודש. מוחזרת הכתובת הציבורית, והיא נשמרת עם הפרסומת.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { sniffImage, ilTodayKey, AD_IMAGE_MAX_BYTES, ADS_SQL_MISSING } from "@/lib/ads";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const bad = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.manage" });
  if (!g.ok) return g.response;

  let form: FormData;
  try { form = await req.formData(); } catch { return bad("בחרו קובץ תמונה", 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return bad("בחרו קובץ תמונה", 400);
  const blob = file as Blob;
  if (blob.size === 0) return bad("הקובץ ריק", 400);
  if (blob.size > AD_IMAGE_MAX_BYTES) return bad("התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב.", 413);

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return bad("אפשר להעלות רק JPEG, PNG או WebP.", 415);

  const path = `creatives/${ilTodayKey().slice(0, 7)}/${crypto.randomUUID()}.${kind.ext}`;
  const up = await adminClient.storage.from("ads").upload(path, bytes, {
    contentType: kind.type, cacheControl: "31536000", upsert: false,
  });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message ?? "")) return bad(ADS_SQL_MISSING, 503);
    console.error("[ads upload]", up.error);
    return bad("ההעלאה נכשלה. נסו שוב.", 500);
  }
  const url = adminClient.storage.from("ads").getPublicUrl(path).data.publicUrl as string;
  await auditLog(g.session, "AD_IMAGE_UPLOAD", "ad_image", path, { bytes: blob.size, type: kind.type },
    req.headers.get("x-forwarded-for") ?? undefined);
  return NextResponse.json({ ok: true, url }, { headers: noStore });
}
