// src/app/api/buildings/[id]/ai-credits/route.ts — קרדיטים ל-AI במתנה לבניין (bloc AI-1, SQL 173).
//
// סופר-אדמין בלבד: קרדיט הוא עלות אמיתית של bloc (OpenAI). ai_topup_grant יוצר תוספת פעילה מיד, בתוקף
// החודשים שנבחרו, ומשמשת אחרי המכסה החודשית — כמו חבילה שנקנתה. מי נתן ולמה — בהזמנה וביומן הפאנל.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, aiGrantSchema } from "@/lib/validation";
import { isMissingRpc } from "@/lib/rpc";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const parsed = await parseBody(req, aiGrantSchema);
  if (!parsed.ok) return parsed.response;
  const { units, months, note } = parsed.data;

  const { data: building } = await adminClient.from("buildings").select("id, name").eq("id", id).maybeSingle();
  if (!building) return NextResponse.json({ error: "הבניין לא נמצא" }, { status: 404 });

  const { data, error } = await adminClient.rpc("ai_topup_grant", {
    p_building: id, p_units: units, p_by: session.email, p_note: note, p_months: months,
  });
  if (error) {
    if (isMissingRpc(error))
      return NextResponse.json({ error: "צריך להריץ קודם את SQL 173 של bloc (קרדיטים ל-AI)." }, { status: 503 });
    console.error("[ai-credits grant]", error);
    return NextResponse.json({ error: "המתנה לא נשמרה. נסו שוב." }, { status: 500 });
  }

  await auditLog(session, "AI_CREDITS_GRANT", "building", id, {
    name: (building as { name?: string | null }).name ?? null, units, months, note, order_id: data ?? null,
  }, ip);
  return NextResponse.json({ ok: true, id: data ?? null });
}
