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
  // bloc 589 (LEDGER-3): nothing of the panel stays on the device after sign-out. The browser drops its HTTP cache and the site's
  // storage, including what the service worker stored and the service worker itself (also copies kept by the old version before it
  // was updated on this device). The panel keeps nothing in browser storage, so nothing else is lost.
  return NextResponse.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache", "storage"' } });
}
