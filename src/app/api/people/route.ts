// src/app/api/people/route.ts — רשימות הדיירים והוועד (bloc UI-R5c-1).
//
// GET ?tab=pending|all|blocked&q=&page= — בקשות הצטרפות שממתינות (בכל הבניינים, גם בניין שני של אדם),
// כל הדיירים והוועד, וחשבונות חסומים. החיפוש והעמודים בשרת (עד עכשיו: כל הרשימה לדפדפן, ונחתכה ב-1,000).
// פרטי קשר מלאים — רק למי שמבצע פעולות; viewer רואה אותם מוסתרים.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { adminClient } from "@/lib/supabase";
import { listPeople, type PeopleTab } from "@/lib/people";
import { maskEmail, maskPhone } from "@/lib/mask";

export const dynamic = "force-dynamic";

const TABS: PeopleTab[] = ["pending", "all", "blocked"];

export async function GET(req: NextRequest) {
  const g = await guard({ permission: "tenants.read" });
  if (!g.ok) return g.response;

  const sp = new URL(req.url).searchParams;
  const tab = (TABS as string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as PeopleTab) : "pending";
  const page = Number(sp.get("page") ?? "1") || 1;

  const r = await listPeople(adminClient, { tab, q: sp.get("q"), page });
  if (r.error) return NextResponse.json({ error: "לא הצלחנו לטעון את הרשימה. נסו שוב." }, { status: 500 });

  const full = can(g.session.role, "tenants.modify");
  const items = full ? r.items : r.items.map((it) => ({
    ...it, person: { ...it.person, phone: maskPhone(it.person.phone), email: maskEmail(it.person.email) },
  }));
  return NextResponse.json({ ...r, items, canAct: full }, { headers: { "Cache-Control": "no-store" } });
}
