import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, buildingCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { notifyExternal } from "@/lib/externalNotify";
import { callBloc } from "@/lib/blocApi";
import { hasPlanField, PLAN_MOVED_TEXT } from "@/lib/buildingPlan";
import { requireStepUp } from "@/lib/stepUp";

// GET הוסר (UI-R5c-1): שימש רק את בורר ההעברה הישן — החזיר לכל סשן (גם viewer) את כל העמודות של כל
// הבניינים, כולל קודי הצטרפות ובניינים בארכיון. דף האדם טוען את הבניינים בשרת.

async function generateInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = "B-" + Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 6)
      .toUpperCase();
    const { data } = await adminClient.from("buildings").select("id").eq("invite_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique invite code");
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "buildings.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  // PANEL-PAY א1 (החלטה 363): בניין חדש נפתח במסלול ברירת המחדל של ה-DB (free). מסלול בלי חיוב — מהכרטיס בדף הבניין
  // (סופר-אדמין, דרך bloc). עד עכשיו admin יכול היה לפתוח בניין עם מסלול בתשלום בלי חיוב.
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }); }
  if (hasPlanField(raw)) return NextResponse.json({ error: PLAN_MOVED_TEXT, code: "plan_moved" }, { status: 400 });
  const p = await parseBody({ json: async () => raw }, buildingCreateSchema);
  if (!p.ok) return p.response;
  const { name, address, max_tenants, admin_email } = p.data;
  if (!name) return NextResponse.json({ error: "שם חובה" }, { status: 400 });
  // PANEL-PAY א1 (החלטה 364): מייל של ראש ועד = מינוי ראש הוועד דרך bloc (founder) — אישור בקוד, לפני היצירה (כדי שהניסיון
  // החוזר אחרי הקוד לא יפתח בניין שני). בניין בלי ראש ועד — בלי קוד.
  if (admin_email) {
    const su = requireStepUp(session, req);
    if (!su.ok) return su.response;
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const invite_code = await generateInviteCode();

  const { data: building, error } = await adminClient
    .from("buildings")
    .insert({ name, address, max_tenants: max_tenants ?? 50, invite_code, is_active: true })
    .select().single();

  if (error) {
    console.error("[buildings POST]", error);
    return NextResponse.json({ error: "יצירת הבניין נכשלה. נסו שוב." }, { status: 500 });
  }

  // ראש הוועד (bloc UI-R5c-1): דרך bloc — חשבון קיים לפי המייל, כחברות ועד בבניין. עד עכשיו הפאנל כתב
  // לפרופיל של מי שנמצא (building_id / role / full_name): הוציא אותו מהבניין שלו, דרס חשבון של חברת ניהול
  // או ספק, וחיפש רק ב-1,000 המשתמשים הראשונים. כשל כאן משאיר בניין תקין בלי ועד — ונאמר במסך.
  let founder: { ok: boolean; code?: string; message?: string } | undefined;
  if (admin_email) {
    const r = await callBloc("/api/internal/members", {
      action: "founder", building_id: building.id, email: admin_email,
      actor: { id: session.id, email: session.email, role: session.role },
    });
    founder = r.ok ? { ok: true } : { ok: false, code: r.code, message: r.error };
  }

  await auditLog(session, "CREATE_BUILDING", "building", building.id, {
    name,
    founder: admin_email ? { email: admin_email, assigned: !!founder?.ok, code: founder?.code ?? null } : null,
  }, ip);

  await notifyExternal("building.created", { name, plan: building.plan ?? "free", id: building.id });

  return NextResponse.json({ data: building, ...(founder ? { founder } : {}) });
}
