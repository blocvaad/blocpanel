// src/app/api/members/route.ts — חברים בבניין וחשבון (bloc UI-R5c-1).
//
// POST — פעולות צוות על אדם: אישור / דחייה של בקשת הצטרפות, הסרה מבניין, מינוי לוועד / הסרה ממנו, דירה
// וקומה, מעבר לבניין אחר, חסימת חשבון / ביטולה. הפאנל לא כותב ל-DB: הבקשה נחתמת ונשלחת ל-bloc
// (/api/internal/members), שמריץ את אותו מסלול כמו באפליקציה — מכסת המסלול, כללי הוועד (הוועד האחרון לא
// מוסר, ראשות עוברת), התראה, מייל ויומן. עד עכשיו הפאנל כתב ל-profiles בעצמו (approval_status / role /
// building_id) — ראו CHANGELOG.
//
// הרשאה: tenants.modify (admin, superadmin). כל פעולה נרשמת גם ביומן הפאנל (MEMBER_*).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody, memberActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AUDIT: Record<string, string> = {
  approve: "MEMBER_APPROVE", reject: "MEMBER_REJECT", remove: "MEMBER_REMOVE", set_role: "MEMBER_ROLE",
  set_apartment: "MEMBER_APARTMENT", transfer: "MEMBER_TRANSFER", block: "ACCOUNT_BLOCK", unblock: "ACCOUNT_UNBLOCK",
};

const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "tenants.modify" });
  if (!g.ok) return g.response;
  const s = g.session;

  const p = await parseBody(req, memberActionSchema);
  if (!p.ok) return p.response;
  // confirm — אישור בממשק בלבד; לא נשלח ל-bloc.
  const { confirm: _confirm, ...body } = p.data as typeof p.data & { confirm?: true };
  void _confirm;

  const r = await callBloc("/api/internal/members", { ...body, actor: { id: s.id, email: s.email, role: s.role } });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });

  const building = "building_id" in body ? body.building_id : "to_building_id" in body ? body.to_building_id : undefined;
  await auditLog(s, AUDIT[body.action] ?? "MEMBER_ACTION", "tenant", body.user_id, {
    action: body.action,
    ...(building ? { building_id: building } : {}),
    ...("from_building_id" in body ? { from_building_id: body.from_building_id } : {}),
    ...("role" in body ? { role: body.role } : {}),
    ...("reason" in body ? { reason: body.reason } : {}),
    ...(body.panel_note ? { note: body.panel_note } : {}),
    result: r.data,
  }, firstIp(req.headers.get("x-forwarded-for")));

  return NextResponse.json({ ok: true, ...r.data });
}
