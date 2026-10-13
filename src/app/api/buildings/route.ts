import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, buildingCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { notifyExternal } from "@/lib/externalNotify";
import { callBloc } from "@/lib/blocApi";

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

  const p = await parseBody(req, buildingCreateSchema);
  if (!p.ok) return p.response;
  const { name, address, max_tenants, plan, comp_reason, admin_email } = p.data;
  if (!name) return NextResponse.json({ error: "שם חובה" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const invite_code = await generateInviteCode();

  const { data: building, error } = await adminClient
    .from("buildings")
    .insert({
      name, address, max_tenants: max_tenants ?? 50, plan: plan || "free", invite_code, is_active: true,
      comp_reason: plan && plan !== "free" ? comp_reason : null,
    })
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
    name, plan, comp_reason: plan && plan !== "free" ? comp_reason : null,
    founder: admin_email ? { email: admin_email, assigned: !!founder?.ok, code: founder?.code ?? null } : null,
  }, ip);

  await notifyExternal("building.created", { name, plan, id: building.id });

  return NextResponse.json({ data: building, ...(founder ? { founder } : {}) });
}
