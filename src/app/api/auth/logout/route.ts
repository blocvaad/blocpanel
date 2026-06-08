import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { hashToken, clearSessionCookie } from "@/lib/auth";
export async function POST(req: NextRequest) {
  const token = req.cookies.get("blocpanel_session")?.value;
  if (token) await adminClient.from("panel_sessions").delete().eq("token_hash", hashToken(token));
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
