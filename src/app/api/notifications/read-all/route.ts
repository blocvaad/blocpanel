import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await adminClient.from("notifications").update({ is_read: true }).eq("is_read", false);
  return NextResponse.json({ ok: true });
}
