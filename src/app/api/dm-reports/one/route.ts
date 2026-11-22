// src/app/api/dm-reports/one/route.ts — MOD-1 (bloc MG-S1179, החלטה 584): דיווח אחד על שיחה פרטית, למסך שלו.
//
//   POST — { id } → bloc החתום (one): ההודעות שאומתו (בלי מפתחות הקבצים), מי ואיפה, וההיסטוריה · dm_reports.read (מנהל וסופר-אדמין).
//   POST ולא GET: כל פתיחה נרשמת — ב-bloc לפני שהתוכן יוצא, וביומן הפאנל (DM_REPORT_VIEW, ב-loadDmReport). סקירת MOD-1 (#2): התוכן
//   מגיע לדף מכאן ולא ב-HTML שלו — ה-service worker של הפאנל שומר עותק של כל דף, ולא של /api/ (והתשובה no-store).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/validation";
import { loadDmReport } from "@/lib/dmReportsServer";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const Body = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "מזהה לא תקין") }).strict();

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "dm_reports.read" });
  if (!g.ok) return g.response;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const data = await loadDmReport(g.session, parsed.data.id.toLowerCase());
  const status = data.state === "ok" ? 200 : data.state === "not_found" ? 404 : data.state === "missing" ? 503 : 502;
  return NextResponse.json(data, { status, headers: noStore });
}
