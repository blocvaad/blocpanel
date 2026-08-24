import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { adminClient } from "./supabase";

// ── Secret: fail closed in production (audit P0.3) ────────────────
// No silent dev-secret fallback in prod. Local dev may use a fallback so
// the app still runs without env wiring, but production must set the secret.
function getSecret(): Uint8Array {
  const s = process.env.PANEL_JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PANEL_JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev_only_insecure_secret_do_not_use_in_prod");
  }
  return new TextEncoder().encode(s);
}
const SECRET = getSecret();

const COOKIE_NAME = "blocpanel_session";
const SESSION_DURATION = 60 * 60 * 8;

// Assurance level carried inside the JWT.
//  - "pre_mfa": password verified, MFA still pending. NO privileged access.
//  - "mfa":     MFA completed. Full privileged session.
export type AuthLevel = "pre_mfa" | "mfa";

export interface PanelAdmin {
  id: string; email: string; full_name: string; role: "superadmin"|"admin"|"viewer";
}

export interface PanelSession extends PanelAdmin {
  auth_level: AuthLevel;
  mfa_verified_at?: string | null;
}

export async function signToken(
  payload: PanelAdmin,
  authLevel: AuthLevel = "mfa",
  mfaVerifiedAt: string | null = null
): Promise<string> {
  return new SignJWT({ ...payload, auth_level: authLevel, mfa_verified_at: mfaVerifiedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(SECRET);
}

/** Decode + signature check only. Does NOT prove the session is live/unrevoked. */
export async function verifyToken(token: string): Promise<PanelSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const p = payload as unknown as Partial<PanelSession>;
    // Back-compat: tokens minted before this change have no auth_level.
    // Treat a missing level as pre_mfa so old full-access tokens can't skip MFA.
    return {
      id: p.id!, email: p.email!, full_name: p.full_name!, role: p.role!,
      auth_level: (p.auth_level as AuthLevel) ?? "pre_mfa",
      mfa_verified_at: p.mfa_verified_at ?? null,
    };
  } catch { return null; }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Read the raw session cookie value, if any. */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Decode the cookie's JWT. Signature-valid only — use for the pre-MFA step.
 * For privileged routes use requireFullSession(), which also checks the DB.
 */
export async function getSession(): Promise<PanelSession | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Full authorization gate for privileged requests (audit P0.2 / P0.4).
 * Requires all of:
 *   - a signature-valid JWT
 *   - auth_level === "mfa"
 *   - a matching panel_sessions row that is not revoked and not expired
 *   - the admin still exists and is_active
 * Returns the session on success, or a reason string on failure.
 */
export async function requireFullSession(): Promise<
  { ok: true; session: PanelSession } | { ok: false; reason: "unauthenticated"|"mfa_required"|"revoked"|"expired"|"disabled" }
> {
  const token = await getSessionToken();
  if (!token) return { ok: false, reason: "unauthenticated" };

  const session = await verifyToken(token);
  if (!session) return { ok: false, reason: "unauthenticated" };
  if (session.auth_level !== "mfa") return { ok: false, reason: "mfa_required" };

  // Session must be live and unrevoked.
  const { data: row } = await adminClient
    .from("panel_sessions")
    .select("id, admin_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!row || row.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Admin must still exist and be active (role changes take effect immediately).
  const { data: admin } = await adminClient
    .from("panel_admins")
    .select("id, role, is_active")
    .eq("id", session.id)
    .maybeSingle();

  if (!admin || !admin.is_active) return { ok: false, reason: "disabled" };

  // Trust the DB role over the (possibly stale) token role.
  return { ok: true, session: { ...session, role: admin.role as PanelSession["role"] } };
}

export async function setSessionCookie(token: string): Promise<void> {
  const cs = await cookies();
  cs.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cs = await cookies();
  cs.delete(COOKIE_NAME);
}

export async function auditLog(
  admin: PanelAdmin, action: string,
  entityType?: string, entityId?: string,
  metadata?: Record<string, unknown>, ip?: string
): Promise<void> {
  await adminClient.from("panel_audit_logs").insert({
    admin_id: admin.id, admin_email: admin.email, action,
    entity_type: entityType, entity_id: entityId,
    metadata: metadata ?? {}, ip_address: ip,
  });
}
