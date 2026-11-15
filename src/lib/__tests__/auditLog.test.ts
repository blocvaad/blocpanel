// PANEL-PAY א1 (S988, החלטה 365): יומן הפאנל — כשל בכתיבה נרשם (console.error עם שם הפעולה בלבד) ולא מפיל את הפעולה;
// הכתובת היא הראשונה ב-X-Forwarded-For, ורק אם היא נראית ככתובת IP (העמודה היא INET).
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
let insertResult: any = { error: null };
let insertThrows = false;
const rows: any[] = [];
vi.mock("../supabase", () => ({
  adminClient: {
    from: (table: string) => ({
      insert: (row: any) => {
        rows.push({ table, row });
        if (insertThrows) throw new Error("network down");
        return Promise.resolve(insertResult);
      },
    }),
  },
}));

import { auditLog, auditIp } from "../auth";
const ADMIN = { id: "a1", email: "admin@bloc.co.il", full_name: "A", role: "superadmin" as const };

beforeEach(() => { insertResult = { error: null }; insertThrows = false; rows.length = 0; });

describe("auditLog", () => {
  it("writes the row with the first X-Forwarded-For address", async () => {
    await auditLog(ADMIN, "BUILDING_PLAN_GRANTED", "building", "b1", { plan: "tower" }, "203.0.113.7, 10.0.0.1");
    expect(rows[0]).toEqual({ table: "panel_audit_logs", row: {
      admin_id: "a1", admin_email: "admin@bloc.co.il", action: "BUILDING_PLAN_GRANTED", entity_type: "building", entity_id: "b1",
      metadata: { plan: "tower" }, ip_address: "203.0.113.7",
    } });
  });
  it("an insert error: console.error with the action name only — no metadata, no email; the action is not broken", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertResult = { error: { message: "invalid input syntax for type inet" } };
    await expect(auditLog(ADMIN, "AI_CREDITS_GRANT", "building", "b1", { note: "סוד פנימי" }, "1.2.3.4")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(["[auditLog] insert failed:", "AI_CREDITS_GRANT"]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("סוד פנימי");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("admin@bloc.co.il");
    spy.mockRestore();
  });
  it("an insert that throws is caught the same way", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertThrows = true;
    await expect(auditLog(ADMIN, "STEPUP_VERIFIED")).resolves.toBeUndefined();
    expect(spy.mock.calls[0]).toEqual(["[auditLog] insert failed:", "STEPUP_VERIFIED"]);
    spy.mockRestore();
  });
  it("no error → nothing printed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await auditLog(ADMIN, "UPDATE_ADMIN", "panel_admin", "t1", {}, "1.2.3.4");
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });
});

describe("auditIp", () => {
  it("the first entry, trimmed; IPv4 and IPv6", () => {
    expect(auditIp("203.0.113.7, 10.0.0.1, 10.0.0.2")).toBe("203.0.113.7");
    expect(auditIp(" 2001:db8::1 ,10.0.0.1")).toBe("2001:db8::1");
    expect(auditIp("1.2.3.4")).toBe("1.2.3.4");
  });
  it("nothing usable → null (the row is still written, without an address)", () => {
    for (const v of [undefined, null, "", "unknown", "  , 1.2.3.4", "<script>", "a.b"]) expect(auditIp(v as any)).toBeNull();
  });
});
