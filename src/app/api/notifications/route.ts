import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const { data } = await adminClient.from("notifications").select("id,type,title,content,link,is_read,created_at").order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ data: data ?? [] });
}
