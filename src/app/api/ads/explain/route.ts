// src/app/api/ads/explain/route.ts — "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b, SQL 176).
//
// POST { email, screen? }  (ads.read) → ההסבר מ-bloc (/api/internal/ads/explain, חתום). קריאה בלבד: bloc לא כותב
// דבר ולא סופר. הבדיקה נרשמת ביומן הפאנל (AD_EXPLAIN — מי בדק את מי), בלי התשובה עצמה.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const Schema = z.object({
  email: z.string().trim().email("מייל לא תקין").max(200, "המייל ארוך מדי"),
  screen: z.enum(["home", "market", "events"]).default("home"),
}).strict();

const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.read" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, Schema);
  if (!p.ok) return p.response;

  const r = await callBloc("/api/internal/ads/explain", { email: p.data.email, screen: p.data.screen });
  if (!r.ok) {
    // bloc ישן (לפני ADS-1b) עונה 401 / 404 בלי קוד — כבר מתורגם ב-callBloc למשפט עם הפתרון.
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: noStore });
  }
  await auditLog(g.session, "AD_EXPLAIN", "tenant", undefined, { email: p.data.email.toLowerCase(), screen: p.data.screen }, firstIp(req.headers.get("x-forwarded-for")));
  return NextResponse.json({ ok: true, result: r.data }, { headers: noStore });
}
