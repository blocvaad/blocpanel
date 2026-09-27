// src/app/api/management-companies/billing/route.ts
//
// מסלול לחברת ניהול בלי חיוב (פיילוט / שותפות) — סופר-אדמין בלבד.
//
//   grant      → plan = X, plan_expires = NULL, comp_reason = סיבה.
//                נחסם כשלחברה מנוי PayPlus חי — אסור שני מקורות זכאות לאותה חברה.
//   end_grant  → comp_reason = NULL, plan_expires = now(). לא "כיבוי": הבניינים
//                עוברים את אותו מסלול כמו חברה שלא שילמה — 7 ימי חסד ואז 14 ימי
//                חסד יציאה בלי חיוב אוטומטי (120). אף ועד לא מתעורר בלי Pro.
//
// הכתיבה עם service_role (קורא אמין ל-guard של 119). כל שינוי נרשם ביומן הפאנל.
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, companyGrantSchema } from "@/lib/validation";
import { anyPlanLabel } from "@/lib/plans";
import { notifyUser } from "@/lib/notify";

export const dynamic = "force-dynamic";

const LIVE = ["trialing", "active", "past_due", "cancel_pending"];

export async function POST(req: Request) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, companyGrantSchema);
  if (!p.ok) return p.response;
  const body = p.data;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const { data: company } = await adminClient
    .from("management_companies")
    .select("id, name, owner_id, status, plan, plan_expires, comp_reason")
    .eq("id", body.id).maybeSingle();
  if (!company) return NextResponse.json({ error: "חברה לא נמצאה" }, { status: 404 });

  if (body.action === "grant") {
    if (company.status !== "active")
      return NextResponse.json({ error: "אפשר להעניק מסלול רק לחברה מאושרת" }, { status: 409 });
    const { data: live } = await adminClient
      .from("billing_subscriptions").select("id, status")
      .eq("owner_type", "management_company").eq("owner_id", body.id).in("status", LIVE).limit(1);
    if ((live ?? []).length)
      return NextResponse.json({ error: "לחברה מנוי משלם פעיל — אין צורך בהענקה" }, { status: 409 });

    const { error } = await adminClient.from("management_companies")
      .update({ plan: body.plan, plan_expires: null, comp_reason: body.reason })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: "העדכון נכשל" }, { status: 500 });

    await notifyUser(company.owner_id, {
      title: `מסלול ${anyPlanLabel(body.plan)} הופעל לחברה`,
      content: "כל הבניינים בתיק מקבלים את כל היכולות, בלי חיוב.",
      link: "/management/subscription",
    });
    await auditLog(g.session, "MANAGEMENT_PLAN_GRANTED", "management_company", body.id,
      { company: company.name, plan: body.plan, reason: body.reason, previous: { plan: company.plan, comp_reason: company.comp_reason } }, ip);
    return NextResponse.json({ ok: true });
  }

  // end_grant
  if (!company.comp_reason)
    return NextResponse.json({ error: "לחברה אין מסלול מוענק" }, { status: 409 });
  const endsAt = new Date().toISOString();
  const { error } = await adminClient.from("management_companies")
    .update({ comp_reason: null, plan_expires: endsAt })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: "העדכון נכשל" }, { status: 500 });

  await notifyUser(company.owner_id, {
    title: "המסלול המוענק לחברה הסתיים",
    content: "הבניינים שומרים על כל היכולות בתקופת חסד. כדי להמשיך — בחרו מסלול במסך המנוי של החברה.",
    link: "/management/subscription",
  });
  await auditLog(g.session, "MANAGEMENT_PLAN_GRANT_ENDED", "management_company", body.id,
    { company: company.name, plan: company.plan, previous_reason: company.comp_reason, grace_from: endsAt }, ip);
  return NextResponse.json({ ok: true });
}
