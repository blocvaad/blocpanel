import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { hashToken, clearSessionCookie } from "@/lib/auth";
export async function POST(req: NextRequest) {
  const token = req.cookies.get("blocpanel_session")?.value;
  if (token) {
    // Revoke rather than hard-delete, so the row remains for audit/history
    // and requireFullSession() rejects the token immediately.
    await adminClient.from("panel_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token));
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
