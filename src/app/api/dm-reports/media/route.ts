// src/app/api/dm-reports/media/route.ts — MOD-1 (bloc MG-S1179, החלטה 520): קובץ אחד שדווח, לפתיחה בדפדפן של איש הצוות.
//
//   POST — { id, media_id } → bloc החתום (/api/internal/dm-reports, media) · dm_reports.read (מנהל וסופר-אדמין; נבדק גם ב-bloc).
//   תשובה: כתובת חתומה ל-120 שניות לקובץ המוצפן, המפתח וה-IV שלו, והסוג (רק סוג שהדפדפן מציג כמדיה). הדפדפן מוריד ופותח (AES-GCM);
//   הקובץ הפתוח לא עובר בשרת של הפאנל ולא נשמר. POST ולא GET: כל פתיחה נרשמת — ב-bloc (לפני שהכתובת יוצאת) וביומן הפאנל
//   (DM_REPORT_MEDIA). תשובה שאינה בצורה הנכונה (כתובת שאינה של ה-Supabase שלנו, מפתח לא תקין) — לא עוברת לדפדפן.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { dmFailure, dmMediaSchema, parseDmMedia } from "@/lib/dmReports";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "dm_reports.read" });
  if (!g.ok) return g.response;
  const session = g.session;
  const parsed = await parseBody(req, dmMediaSchema);
  if (!parsed.ok) return parsed.response;
  const { id, media_id } = parsed.data;

  const r = await callBloc("/api/internal/dm-reports", { actor: actorOf(session), action: "media", id, media_id });
  if (!r.ok) {
    const f = dmFailure(r, "media");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status, headers: noStore });
  }
  const m = parseDmMedia(r.data, process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
  if (!m) return NextResponse.json({ error: "התשובה מ-bloc לא בצורה המוכרת, ולכן הקובץ לא נפתח.", code: "bad_shape" }, { status: 502, headers: noStore });
  await auditLog(session, "DM_REPORT_MEDIA", "dm_report", id, { media_id, kind: m.kind }, firstIp(req.headers.get("x-forwarded-for")));
  return NextResponse.json({ ok: true, ...m }, { headers: noStore });
}
