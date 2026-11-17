// src/app/api/ads/estimate/route.ts — "כמה אנשים הקהל הזה?" (bloc ADS-2א v2, החלטה 382). קריאה בלבד, כמו הדוח (עד א3).
//
// POST { screens, plans, roles, cities, building_ids }  (ads.manage — מי שבונה קמפיין; סקירה ADS-2א #4) → ad_estimate_reach
// (SECURITY DEFINER, service role בלבד) → { ok, users, buildings, under10 } — מספרים בלבד, אף פעם לא מזהים או שמות. bloc סופר רק
// בניינים עם 10 מתאימים לפחות (k = 10 לכל בניין) ומעגל את המשתמשים כלפי מטה לעשרות; פחות מ-10 — 0 עם under10. לפני SQL 230 —
// 503 sql_missing ("ההערכה תופיע אחרי SQL 230"); כשל — "לא הצלחנו להעריך כרגע" (אף פעם לא 0). לא נרשם ביומן: אין בו פרטים של
// אף אחד, והמד שואל אחרי כל שינוי בקהל (היומן היה מתמלא בהערכות).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { parseBody } from "@/lib/validation";
import { adsSqlMissing } from "@/lib/ads";
import { parseEstimate, ESTIMATE_SQL_MISSING_TEXT, ESTIMATE_FAILED_TEXT } from "@/lib/adsStudio";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
/** לפחות אחד; כפילויות לא מזיקות (מסוננות) — הגבול רק נגד גוף ענק. */
const subset = <T extends string>(all: readonly [T, ...T[]]) => z.array(z.enum(all)).min(1).max(20).transform((a) => [...new Set(a)]);
const Schema = z.object({
  // ADS-2ג1: + דואר נכנס והודעות הוועד (ad_estimate_reach מכיר אותם מ-SQL 233)
  screens: subset(["home", "market", "events", "inbox", "announcements"] as const),
  plans: subset(["free", "building", "large", "tower", "company"] as const),
  roles: subset(["tenant", "committee"] as const),
  cities: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  building_ids: z.array(z.string().uuid()).max(500).default([]),
}).strict();

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.manage" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, Schema);
  if (!p.ok) return p.response;
  const b = p.data;
  const r = await adminClient.rpc("ad_estimate_reach", {
    p_screens: b.screens, p_plans: b.plans, p_roles: b.roles, p_cities: b.cities, p_buildings: b.building_ids,
  });
  if (r.error) {
    if (adsSqlMissing(r.error)) return NextResponse.json({ error: ESTIMATE_SQL_MISSING_TEXT, code: "sql_missing" }, { status: 503, headers: noStore });
    console.error("[ads estimate]", r.error.code ?? "error");
    return NextResponse.json({ error: ESTIMATE_FAILED_TEXT, code: "failed" }, { status: 502, headers: noStore });
  }
  const e = parseEstimate(r.data);
  if (!e) return NextResponse.json({ error: ESTIMATE_FAILED_TEXT, code: "bad_shape" }, { status: 502, headers: noStore });
  return NextResponse.json({ ok: true, ...e }, { headers: noStore });
}
