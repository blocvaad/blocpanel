import { z } from "zod";

// Centralized input schemas for privileged panel mutations (audit P0.8).
// Every mutation validates its body through one of these before touching the
// DB. This is an allowlist: unknown/forbidden fields (id, invite_code,
// is_active, timestamps, …) are stripped, never written. `.strict()` rejects
// any key not declared here so a caller can't smuggle extra columns.

// ── Buildings ──
export const buildingUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(400).optional(),
  max_tenants: z.number().int().positive().max(100000).optional(),
  plan: z.enum(["free", "basic", "pro", "enterprise"]).optional(),
}).strict();

export const buildingCreateSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  max_tenants: z.coerce.number().int().positive().max(100000).optional(),
  plan: z.string().max(40).optional(),
  admin_email: z.string().email().optional(),
  admin_name: z.string().max(200).optional(),
}).strict();

export const buildingArchiveSchema = z.object({
  reason: z.string().max(1000).optional(),
}).strict();

// ── Tenants ──
export const tenantUpdateSchema = z.object({
  approval_status: z.enum(["pending", "approved", "blocked", "rejected"]).optional(),
  role: z.enum(["tenant", "admin", "management"]).optional(),
  floor: z.union([z.number(), z.string()]).optional(),
}).strict();

export const tenantTransferSchema = z.object({
  tenant_id: z.string().uuid(),
  to_building_id: z.string().uuid(),
  new_apartment: z.string().max(40).optional(),
}).strict();

// ── Panel admins ──
export const adminUpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(["superadmin", "admin", "viewer"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
}).strict();

export const adminCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["superadmin", "admin", "viewer"]),
}).strict();

// ── Management companies ──
export const managementActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "suspend", "reactivate"]),
  reason: z.string().max(1000).optional(),
}).strict();

// ── Broadcast ──
export const broadcastSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(5000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  building_id: z.string().uuid().optional(),
  expires_in_days: z.number().nonnegative().max(3650).optional(),
}).strict();

// ── Helper: parse a request body, returning either the typed data or a
//    ready-to-return 400 with the validation errors. ──
import { NextResponse } from "next/server";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseBody<T>(
  req: { json: () => Promise<unknown> },
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path.join(".") || "";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `שדה לא תקין${field ? `: ${field}` : ""}`, issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
