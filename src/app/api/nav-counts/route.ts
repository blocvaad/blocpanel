// src/app/api/nav-counts/route.ts
//
// bloc COMPANY-1 (MG-S1252, bloc החלטה 654) — המונים שליד פריטי התפריט: חברות ניהול שממתינות לאישור, ובקשות לנהל בניין שאין בו
// ועד. עד עכשיו בקשת הרשמה של חברה חיכתה ימים בלי שמישהו בצוות ראה אותה — המונה היה רק בתוך מסך החברות.
// מונה שלא נטען — null (התפריט לא מציג מספר; לעולם לא 0 על כשל).
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const [companies, links] = await Promise.all([
    (adminClient as any).from("management_companies").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    (adminClient as any).from("management_link_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return NextResponse.json(
    { companies: companies.error ? null : companies.count ?? 0, links: links.error ? null : links.count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
