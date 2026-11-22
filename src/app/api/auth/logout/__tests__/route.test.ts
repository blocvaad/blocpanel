// bloc 589 (LEDGER-3): יציאה מהחשבון — הסשן נשלל (השורה נשארת ליומן), העוגייה נמחקת, והדפדפן מתבקש למחוק את מה שהפאנל השאיר במכשיר:
// המטמון והאחסון של האתר (גם עותקים שה-service worker הישן שמר, לפני שהתעדכן במכשיר הזה).
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const updates: Array<{ table: string; values: Record<string, unknown>; eq: [string, string] }> = [];
let cleared = 0;
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (col: string, val: string) => { updates.push({ table, values, eq: [col, val] }); return { error: null }; },
      }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ hashToken: (t: string) => `h(${t})`, clearSessionCookie: async () => { cleared++; } }));

import { POST } from "../route";

// the route reads only the session cookie
const req = (cookie?: string) =>
  ({ cookies: { get: (k: string) => (k === "blocpanel_session" && cookie ? { value: cookie } : undefined) } }) as unknown as NextRequest;

beforeEach(() => { updates.length = 0; cleared = 0; });

describe("POST /api/auth/logout", () => {
  it("revokes the session (the row stays for the log), clears the cookie, and tells the browser to drop the cache and the storage", async () => {
    const r = await POST(req("tok1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("panel_sessions");
    expect(updates[0].eq).toEqual(["token_hash", "h(tok1)"]);
    expect(typeof updates[0].values.revoked_at).toBe("string");
    expect(cleared).toBe(1);
    expect(r.headers.get("Clear-Site-Data")).toBe('"cache", "storage"');
  });

  it("without a session cookie: nothing to revoke, and the device is still cleared", async () => {
    const r = await POST(req());
    expect(r.status).toBe(200);
    expect(updates).toEqual([]);
    expect(cleared).toBe(1);
    expect(r.headers.get("Clear-Site-Data")).toBe('"cache", "storage"');
  });
});
