import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [buildings, tenants, tickets] = await Promise.all([
    adminClient.from("buildings").select("id,name,address").ilike("name", `%${q}%`).limit(5),
    adminClient.from("panel_tenants_view").select("id,full_name,building_name,apartment_display,approval_status").ilike("full_name", `%${q}%`).limit(8),
    adminClient.from("panel_tickets_view").select("id,title,building_name,status,building_id").ilike("title", `%${q}%`).limit(5),
  ]);

  const results = [
    ...(buildings.data ?? []).map(b => ({
      type: "building" as const, id: b.id,
      title: b.name, sub: b.address ?? "אין כתובת",
      href: `/buildings/${b.id}`,
    })),
    ...(tenants.data ?? []).map(t => ({
      type: "tenant" as const, id: t.id,
      title: t.full_name, sub: `${t.building_name} · ${t.hide_apartment ? "" : "דירה " + t.apartment_display}`,
      href: `/tenants/${t.id}`,
      badge: t.approval_status,
    })),
    ...(tickets.data ?? []).map(t => ({
      type: "ticket" as const, id: t.id,
      title: t.title, sub: `${t.building_name} · ${t.status}`,
      href: `/buildings/${t.building_id}`,
    })),
  ];

  return NextResponse.json({ results });
}
