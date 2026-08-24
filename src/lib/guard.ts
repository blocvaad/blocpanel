import { NextResponse } from "next/server";
import { requireFullSession, type PanelSession } from "./auth";
import { can, type Permission, type PanelRole } from "./permissions";

// Standard HTTP response for a failed full-session check.
function sessionDenied(
  reason: "unauthenticated"|"mfa_required"|"revoked"|"expired"|"disabled"
): NextResponse {
  if (reason === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (reason === "mfa_required")    return NextResponse.json({ error: "נדרש אימות דו-שלבי" }, { status: 401 });
  // revoked / expired / disabled — the token is syntactically valid but no
  // longer authorized. 401 so the client re-authenticates.
  return NextResponse.json({ error: "ההרשאה בוטלה. התחבר מחדש." }, { status: 401 });
}

type GuardResult =
  | { ok: true; session: PanelSession }
  | { ok: false; response: NextResponse };

/**
 * Gate a privileged panel request. Always enforces a full (MFA, live,
 * unrevoked, active-admin) session via requireFullSession(). Optionally also
 * requires a permission or an exact role.
 *
 *   const g = await guard();                      // any authenticated full session
 *   const g = await guard({ permission: "..." }); // + permission check
 *   const g = await guard({ role: "superadmin" });// + exact role
 *   if (!g.ok) return g.response;
 *   // g.session is safe to use
 */
export async function guard(opts?: {
  permission?: Permission;
  role?: PanelRole;
}): Promise<GuardResult> {
  const auth = await requireFullSession();
  if (!auth.ok) return { ok: false, response: sessionDenied(auth.reason) };

  const session = auth.session;

  if (opts?.role && session.role !== opts.role) {
    return { ok: false, response: NextResponse.json({ error: `נדרש ${opts.role}` }, { status: 403 }) };
  }

  if (opts?.permission && !can(session.role, opts.permission)) {
    return { ok: false, response: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }) };
  }

  return { ok: true, session };
}
