import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { adminClient } from "./supabase";

const SECRET = new TextEncoder().encode(
  process.env.PANEL_JWT_SECRET ?? "fallback_dev_secret_change_in_prod"
);
const COOKIE_NAME = "blocpanel_session";
const SESSION_DURATION = 60 * 60 * 8;

export interface PanelAdmin {
  id: string; email: string; full_name: string; role: "superadmin"|"admin"|"viewer";
}

export async function signToken(payload: PanelAdmin): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<PanelAdmin | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as PanelAdmin;
  } catch { return null; }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getSession(): Promise<PanelAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
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
