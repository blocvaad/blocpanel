import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await adminClient.from("notifications").select("id,type,title,content,link,is_read,created_at").order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ data: data ?? [] });
}
