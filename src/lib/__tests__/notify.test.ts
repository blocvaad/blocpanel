import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: any[] = [];
let insertError: any = null;
vi.mock("@/lib/supabase", () => ({
  adminClient: { from: (t: string) => ({ insert: async (row: any) => { inserts.push({ t, row }); return { error: insertError }; } }) },
}));

import { noticeRow, notifyUser } from "../notify";

beforeEach(() => { inserts.length = 0; insertError = null; });

describe("notifyUser — product notifications table", () => {
  it("writes receiver_id (the table has no user_id column)", () => {
    const r = noticeRow("u1", { title: "t", content: "c", link: "/x" });
    expect(r.receiver_id).toBe("u1");
    expect("user_id" in r).toBe(false);
    expect(r.type).toBe("announcement");
  });
  it("inserts into notifications and reports success", async () => {
    expect(await notifyUser("u1", { title: "t", content: "c", link: "/x" })).toBe(true);
    expect(inserts[0].t).toBe("notifications");
  });
  it("no receiver → no insert", async () => {
    expect(await notifyUser(null, { title: "t", content: "c", link: "/x" })).toBe(false);
    expect(inserts).toHaveLength(0);
  });
  it("insert error is surfaced as false, not thrown", async () => {
    insertError = { code: "PGRST204", message: "column" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyUser("u1", { title: "t", content: "c", link: "/x" })).toBe(false);
    spy.mockRestore();
  });
});
