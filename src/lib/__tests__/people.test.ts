// bloc UI-R5c-1 — lib/people: הרשימות ודף האדם קוראים מ-building_memberships (כל הבניינים), התשלומים לפי
// payer_id, והמסך אומר כשקריאה נכשלה. DB מדומה שמסנן באמת (eq / in / is / or / range).
import { describe, it, expect } from "vitest";
import {
  roleLabel, maskPhone, maskEmail, cleanQuery, paymentTotals, listPeople, loadPerson, loadBuildingMembers, missingSchema, blocActor,
  blockTag, isLegacyBlock, LEGACY_BLOCK_BY,
} from "../people";

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[] | { error: any }>, log: string[] = []) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let range: [number, number] | null = null;
      let lim = Infinity;
      let count = false;
      const orders: Array<[string, boolean]> = [];
      const src = () => tables[table];
      const rows = () => {
        const t = src();
        if (!Array.isArray(t)) return [];
        const out = t.filter((r) => filters.every((f) => f(r)));
        return orders.length ? [...out].sort((x, y) => {
          for (const [c, asc] of orders) { const a = String(x[c] ?? ""), z = String(y[c] ?? ""); if (a !== z) return (a < z ? -1 : 1) * (asc ? 1 : -1); }
          return 0;
        }) : out;
      };
      const orPart = (expr: string): ((r: Row) => boolean) => {
        const m = /^(\w+)\.(is|in|ilike)\.(.*)$/.exec(expr)!;
        const [, col, op, val] = m;
        if (op === "is") return (r) => (r[col] ?? null) === null;
        if (op === "in") { const vals = val.replace(/[()]/g, "").split(","); return (r) => vals.includes(r[col]); }
        const want = val.replace(/%/g, "").toLowerCase();
        return (r) => typeof r[col] === "string" && r[col].toLowerCase().includes(want);
      };
      const b: any = {
        select: (_c: string, o?: { count?: string }) => { if (o?.count) count = true; log.push(`select ${table}`); return b; },
        eq: (c: string, v: any) => { log.push(`${table}.${c}=${v}`); filters.push((r) => r[c] === v); return b; },
        neq: (c: string, v: any) => { filters.push((r) => r[c] !== v); return b; },
        in: (c: string, v: any[]) => { filters.push((r) => v.includes(r[c])); return b; },
        is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return b; },
        not: (c: string, _op: string, v: any) => { filters.push((r) => (r[c] ?? null) !== v); return b; },
        or: (expr: string) => {
          // ביטוי "a,b" — מפצלים בפסיקים שמחוץ לסוגריים
          const parts: string[] = []; let depth = 0, cur = "";
          for (const ch of expr) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
          parts.push(cur);
          const fs = parts.map(orPart);
          filters.push((r) => fs.some((f) => f(r)));
          return b;
        },
        order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return b; },
        range: (from: number, to: number) => { range = [from, to]; return b; },
        limit: (n: number) => { lim = n; return b; },
        maybeSingle: async () => {
          const t = src();
          if (!Array.isArray(t)) return { data: null, error: t.error };
          return { data: rows()[0] ?? null, error: null };
        },
        then: (resolve: (v: any) => void) => {
          const t = src();
          if (!Array.isArray(t)) return resolve({ data: null, error: t.error, count: null });
          const all = rows();
          let out = all;
          if (range) out = out.slice(range[0], range[1] + 1);
          out = out.slice(0, lim);
          return resolve({ data: out, error: null, count: count ? all.length : null });
        },
      };
      return b;
    },
  };
}

const B1 = "b1", B2 = "b2";
const people = () => [
  { id: "u1", full_name: "דנה לוי", email: "dana@x.com", phone: "0501234567", avatar_url: null, role: "tenant", building_id: B1, approval_status: "approved", created_at: "2026-01-01", deleted_at: null, is_onboarded: true, totp_enabled: false },
  { id: "u2", full_name: "יוסי כהן", email: "yossi@x.com", phone: "0529999999", avatar_url: null, role: "admin", building_id: B1, approval_status: "approved", created_at: "2026-01-02", deleted_at: null, is_onboarded: true, totp_enabled: true },
  { id: "u3", full_name: "גל", email: "gal@x.com", phone: null, avatar_url: null, role: "tenant", building_id: B2, approval_status: "approved", created_at: "2026-01-03", deleted_at: null, is_onboarded: true, totp_enabled: false },
  { id: "u4", full_name: "ספק", email: "sup@x.com", phone: null, avatar_url: null, role: "supplier", building_id: null, approval_status: null, created_at: "2026-01-04", deleted_at: null, is_onboarded: true, totp_enabled: false },
  { id: "u5", full_name: "חסום ישן", email: null, phone: null, avatar_url: null, role: "tenant", building_id: B1, approval_status: "blocked", created_at: "2026-01-05", deleted_at: null, is_onboarded: true, totp_enabled: false },
  // חשבון שנמחק (143 מסמן גם אותו 'blocked') — לא "חסום"
  { id: "u6", full_name: "נמחק", email: null, phone: null, avatar_url: null, role: "tenant", building_id: null, approval_status: "blocked", created_at: "2026-01-06", deleted_at: "2026-02-01", is_onboarded: true, totp_enabled: false },
];
const world = (): Record<string, Row[] | { error: any }> => ({
  profiles: people(),
  buildings: [
    { id: B1, name: "השקד 104", founder_id: "u2", is_active: true, is_archived: false },
    { id: B2, name: "הזית 7", founder_id: null, is_active: true, is_archived: false },
  ],
  building_memberships: [
    { id: "m1", user_id: "u1", building_id: B1, role: "tenant", status: "active", apartment: "3", floor: "1", created_at: "2026-01-01", removed_at: null },
    { id: "m2", user_id: "u2", building_id: B1, role: "admin", status: "active", apartment: "1", floor: null, created_at: "2026-01-02", removed_at: null },
    // u3: הבניין הראשי שלו B2, וביקש להצטרף גם ל-B1 — עד עכשיו לא נראה בפאנל
    { id: "m3", user_id: "u3", building_id: B1, role: "tenant", status: "pending", apartment: "9", floor: null, created_at: "2026-01-06", removed_at: null },
    { id: "m4", user_id: "u3", building_id: B2, role: "tenant", status: "active", apartment: "2", floor: null, created_at: "2026-01-03", removed_at: null },
    { id: "m5", user_id: "u1", building_id: B2, role: "tenant", status: "removed", apartment: null, floor: null, created_at: "2025-01-01", removed_at: "2025-12-01" },
    { id: "m6", user_id: "u5", building_id: B1, role: "tenant", status: "pending", apartment: "7", floor: null, created_at: "2026-01-05", removed_at: null },
  ],
  committee_deputies: [{ building_id: B1, user_id: "u1", status: "active" }, { building_id: B2, user_id: "u3", status: "pending" }],
  account_blocks: [
    { id: "k1", user_id: "u1", reason: "ישן", blocked_at: "2026-02-01", blocked_by: "a@b.co", ended_at: "2026-02-02", ended_by: "a@b.co", end_note: null },
  ],
  payments: [
    { id: "p1", payer_id: "u1", building_id: B1, amount: 300, status: "paid", method: "manual", title: "ועד ינואר", created_at: "2026-01-10", paid_at: "2026-01-11" },
    { id: "p2", payer_id: "u1", building_id: B1, amount: 300, status: "pending", method: null, title: "ועד פברואר", created_at: "2026-02-10", paid_at: null },
    { id: "p3", payer_id: "u1", building_id: B2, amount: 120, status: "pending_approval", method: null, title: "חניה", created_at: "2026-02-11", paid_at: null },
    { id: "p4", payer_id: "u1", building_id: B1, amount: 50, status: "exempt", method: null, title: "פטור", created_at: "2026-02-12", paid_at: null },
    // דייר אחר עם *אותו שם* — לא נספר (קודם: סינון לפי השם)
    { id: "p5", payer_id: "u9", building_id: B1, amount: 999, status: "paid", method: null, title: "ועד ינואר", created_at: "2026-01-10", paid_at: "2026-01-10" },
  ],
  panel_audit_logs: [{ id: "l1", entity_id: "u1", action: "MEMBER_APPROVE", admin_email: "ops@bloc.co.il", created_at: "2026-03-01T10:00:00Z", metadata: {} }],
  audit_logs: [{ id: "a1", target_id: "u1", action: "tenant_approved", building_id: B1, created_at: "2026-03-01T10:00:01Z", details: { via: "panel", panel_admin: "ops@bloc.co.il" } }],
  management_companies: [],
  company_employees: [],
  supplier_profiles: [],
});

describe("display helpers", () => {
  it("role in words — head, committee, deputy, tenant (no emoji, no 'מנהל')", () => {
    expect(roleLabel({ role: "admin", userId: "u2", founderId: "u2", deputy: false })).toBe("ראש הוועד");
    expect(roleLabel({ role: "admin", userId: "u2", founderId: "x", deputy: false })).toBe("חבר/ת ועד");
    expect(roleLabel({ role: "tenant", userId: "u1", founderId: "x", deputy: true })).toBe("דייר/ת, ממלא/ת מקום");
    expect(roleLabel({ role: "tenant", userId: "u1", founderId: null, deputy: false })).toBe("דייר/ת");
  });
  it("masking for a viewer; queries cleaned for PostgREST", () => {
    expect(maskPhone("050-123-4567")).toBe("•••4567");
    expect(maskPhone(null)).toBeNull();
    expect(maskEmail("dana@x.com")).toBe("d•••@x.com");
    expect(cleanQuery(" דנה,(לוי)*%_ ")).toBe("דנה לוי");
    expect(cleanQuery('דנה "לוי"')).toBe("דנה לוי");
    expect(cleanQuery("x".repeat(100))).toHaveLength(60);
  });
  it("payment totals follow bloc's states: paid; open debt = pending + reported; exempt is neither", () => {
    expect(paymentTotals(world().payments as any[])).toEqual({ paid: 1299, paidCount: 2, debt: 420, debtCount: 2 });
  });
  it("who acted, from bloc's log", () => {
    expect(blocActor({ via: "panel", panel_admin: "ops@bloc.co.il" })).toBe("צוות bloc (ops@bloc.co.il)");
    expect(blocActor({})).toBeNull();
  });
  it("the block tag: a staff block; the old kind (the row bloc 172 added for it, or only the status); nothing", () => {
    expect(blockTag({ block: { blocked_by: "ops@bloc.co.il" } })).toBe("חסום");
    expect(blockTag({ block: { blocked_by: LEGACY_BLOCK_BY }, legacyStatus: true })).toBe("חסום (שיטה ישנה)");
    expect(blockTag({ block: null, legacyStatus: true })).toBe("חסום (שיטה ישנה)");
    expect(blockTag({ block: { blocked_by: "ops@bloc.co.il" }, legacyStatus: true })).toBe("חסום");
    expect(blockTag({ block: null, legacyStatus: false })).toBeNull();
    expect(isLegacyBlock({ blocked_by: "legacy:approval_status" })).toBe(true);
    expect(isLegacyBlock({ blocked_by: "ops@bloc.co.il" })).toBe(false);
    expect(isLegacyBlock(null)).toBe(false);
  });
  it("missing schema is recognized (bloc 172 not run yet)", () => {
    expect(missingSchema({ code: "42P01" })).toBe(true);
    expect(missingSchema({ code: "PGRST205" })).toBe(true);
    expect(missingSchema({ code: "57014", message: "timeout" })).toBe(false);
  });
});

describe("listPeople", () => {
  it("pending: requests in ALL buildings — including a person whose primary building is elsewhere", async () => {
    const r = await listPeople(fakeDb(world()) as any, { tab: "pending" });
    expect(r.error).toBe(false);
    expect(r.items.map((i) => [i.person.id, i.request?.building_id, i.request?.building?.name])).toEqual([["u5", B1, "השקד 104"], ["u3", B1, "השקד 104"]]);
    expect(r.total).toBe(2);
  });

  it("search narrows by name / email / phone digits; no match → nothing (not everything)", async () => {
    const db = fakeDb(world());
    expect((await listPeople(db as any, { tab: "pending", q: "גל" })).items.map((i) => i.person.id)).toEqual(["u3"]);
    expect((await listPeople(db as any, { tab: "all", q: "1234567" })).items.map((i) => i.person.id)).toEqual(["u1"]);
    expect((await listPeople(db as any, { tab: "pending", q: "אף אחד" })).items).toEqual([]);
    expect((await listPeople(db as any, { tab: "all", q: "אף אחד" })).items).toEqual([]);
  });

  it("all: building personas only (no supplier), with every live membership and building names", async () => {
    const r = await listPeople(fakeDb(world()) as any, { tab: "all" });
    const ids = r.items.map((i) => i.person.id);
    expect(ids).not.toContain("u4");
    const u3 = r.items.find((i) => i.person.id === "u3")!;
    expect(u3.memberships.map((m) => [m.building?.name, m.status])).toEqual([["השקד 104", "pending"], ["הזית 7", "active"]]);
    const u1 = r.items.find((i) => i.person.id === "u1")!;
    expect(u1.memberships.map((m) => m.status)).toEqual(["active"]); // removed — לא ברשימה
    expect(r.items.find((i) => i.person.id === "u5")!.legacyBlocked).toBe(true);
  });

  it("paging: 30 per page, with the total", async () => {
    const w = world();
    (w.profiles as Row[]).push(...Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, full_name: `x${i}`, email: null, phone: null, avatar_url: null, role: "tenant", building_id: null, approval_status: null, created_at: "2026-05-01", deleted_at: null })));
    const db = fakeDb(w);
    const p1 = await listPeople(db as any, { tab: "all", page: 1 });
    const p2 = await listPeople(db as any, { tab: "all", page: 2 });
    expect(p1.items).toHaveLength(30);
    expect(p2.items).toHaveLength(14);
    expect(p1.pages).toBe(2);
  });

  it("blocked: open blocks + the old kind; before 172 → only the old kind, and said", async () => {
    const w = world();
    (w.account_blocks as Row[]).push({ id: "k2", user_id: "u2", reason: "התחזות", blocked_at: "2026-03-01", blocked_by: "ops@bloc.co.il", ended_at: null, ended_by: null, end_note: null });
    const r = await listPeople(fakeDb(w) as any, { tab: "blocked" });
    expect(r.items.map((i) => [i.person.id, !!i.block, !!i.legacyBlocked])).toEqual([["u2", true, false], ["u5", false, true]]);
    expect(r.blocksUnavailable).toBe(false);
    const w2 = world();
    w2.account_blocks = { error: { code: "42P01", message: "relation does not exist" } };
    const r2 = await listPeople(fakeDb(w2) as any, { tab: "blocked" });
    expect(r2.blocksUnavailable).toBe(true);
    expect(r2.items.map((i) => i.person.id)).toEqual(["u5"]);
  });

  it("blocked: the old kind with the row bloc 172 added appears once (as that row); a deleted account is not listed; a block read failure is an error", async () => {
    const w = world();
    (w.account_blocks as Row[]).push({ id: "k3", user_id: "u5", reason: "נחסם בשיטה הישנה", blocked_at: "2026-10-13", blocked_by: "legacy:approval_status", ended_at: null, ended_by: null, end_note: null });
    const r = await listPeople(fakeDb(w) as any, { tab: "blocked" });
    expect(r.items.map((i) => [i.person.id, i.block?.blocked_by ?? null])).toEqual([["u5", "legacy:approval_status"]]);
    const w2 = world();
    w2.account_blocks = { error: { code: "57014", message: "timeout" } };
    const r2 = await listPeople(fakeDb(w2) as any, { tab: "blocked" });
    expect(r2.error).toBe(true);
    expect(r2.blocksUnavailable).toBeUndefined();
  });

  it("pending and all: an open block shows on the person's row (also the old kind, by the status)", async () => {
    const w = world();
    (w.account_blocks as Row[]).push({ id: "k2", user_id: "u3", reason: "התחזות", blocked_at: "2026-03-01", blocked_by: "ops@bloc.co.il", ended_at: null, ended_by: null, end_note: null });
    const pending = await listPeople(fakeDb(w) as any, { tab: "pending" });
    expect(pending.items.map((i) => [i.person.id, i.block?.reason ?? null, !!i.legacyBlocked])).toEqual([["u5", null, true], ["u3", "התחזות", false]]);
    const all = await listPeople(fakeDb(w) as any, { tab: "all" });
    expect(all.items.find((i) => i.person.id === "u3")!.block).toEqual({ reason: "התחזות", blocked_at: "2026-03-01", blocked_by: "ops@bloc.co.il" });
    // החסימה הישנה של u1 הסתיימה — לא מוצגת
    expect(all.items.find((i) => i.person.id === "u1")!.block).toBeNull();
  });

  it("before 172 the tags are simply not there; another block read failure is an error (not an untagged list)", async () => {
    const w = world();
    w.account_blocks = { error: { code: "42P01", message: "relation does not exist" } };
    const r = await listPeople(fakeDb(w) as any, { tab: "pending" });
    expect(r.error).toBe(false);
    expect(r.items).toHaveLength(2);
    const w2 = world();
    w2.account_blocks = { error: { code: "57014", message: "timeout" } };
    expect((await listPeople(fakeDb(w2) as any, { tab: "pending" })).error).toBe(true);
    expect((await listPeople(fakeDb(w2) as any, { tab: "all" })).error).toBe(true);
  });

  it("a read failure is reported as an error, never as an empty list", async () => {
    const w = world();
    w.building_memberships = { error: { code: "57014", message: "timeout" } };
    expect((await listPeople(fakeDb(w) as any, { tab: "pending" })).error).toBe(true);
    expect((await listPeople(fakeDb(w) as any, { tab: "all" })).error).toBe(true);
  });
});

describe("loadPerson", () => {
  it("every membership (also removed), deputy flags, payments by payer_id (not by name), both logs", async () => {
    const log: string[] = [];
    const d = await loadPerson(fakeDb(world(), log) as any, "u1");
    if (!d || d === "error") throw new Error("expected a person");
    expect(d.memberships.map((m) => [m.building_id, m.status, m.deputy])).toEqual([[B1, "active", true], [B2, "removed", false]]);
    expect(d.payments.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(log).toContain("payments.payer_id=u1");
    expect(d.openBlock).toBeNull();
    expect(d.blocks).toHaveLength(1);
    expect(d.panelLog).toHaveLength(1);
    expect(d.blocLog).toHaveLength(1);
    expect(d.buildingNames).toEqual({ [B1]: "השקד 104", [B2]: "הזית 7" });
    expect(d.failed).toEqual([]);
  });

  it("missing → null; a profile read failure → 'error' (not 'not found'); partial failures are listed", async () => {
    expect(await loadPerson(fakeDb(world()) as any, "nope")).toBeNull();
    const w = world();
    w.profiles = { error: { code: "57014", message: "timeout" } };
    expect(await loadPerson(fakeDb(w) as any, "u1")).toBe("error");
    const w2 = world();
    w2.payments = { error: { code: "57014", message: "timeout" } };
    w2.account_blocks = { error: { code: "42P01", message: "missing" } };
    const d = await loadPerson(fakeDb(w2) as any, "u1");
    if (!d || d === "error") throw new Error("expected a person");
    expect(d.failed).toEqual(["התשלומים"]);
    expect(d.blocksUnavailable).toBe(true);
    const w3 = world();
    w3.account_blocks = { error: { code: "57014", message: "timeout" } };
    const d3 = await loadPerson(fakeDb(w3) as any, "u1");
    if (!d3 || d3 === "error") throw new Error("expected a person");
    expect(d3.failed).toEqual(["החסימות"]);
    expect(d3.blocksUnavailable).toBe(false);
  });

  it("a deputy nomination that was not accepted yet is not 'ממלא מקום'", async () => {
    const d = await loadPerson(fakeDb(world()) as any, "u3");
    if (!d || d === "error") throw new Error("expected a person");
    expect(d.memberships.map((m) => [m.building_id, m.deputy])).toEqual([[B1, false], [B2, false]]);
  });

  it("an open block is found", async () => {
    const w = world();
    (w.account_blocks as Row[]).push({ id: "k2", user_id: "u1", reason: "התחזות", blocked_at: "2026-03-01", blocked_by: "ops@bloc.co.il", ended_at: null, ended_by: null, end_note: null });
    const d = await loadPerson(fakeDb(w) as any, "u1");
    if (!d || d === "error") throw new Error("expected a person");
    expect(d.openBlock?.id).toBe("k2");
  });
});

describe("loadBuildingMembers", () => {
  it("head first, committee, then pending, then tenants — from memberships (also a second building), with flags", async () => {
    const r = await loadBuildingMembers(fakeDb(world()) as any, { id: B1, founder_id: "u2" });
    expect(r.error).toBe(false);
    expect(r.members.map((m) => [m.id, m.head, m.status, m.deputy, m.blocked])).toEqual([
      ["u2", true, "active", false, false],
      ["u3", false, "pending", false, false],
      ["u5", false, "pending", false, true],
      ["u1", false, "active", true, false],
    ]);
  });
  it("a read failure is an error, not 'no members' — also a failed block read", async () => {
    const w = world();
    w.building_memberships = { error: { code: "57014", message: "timeout" } };
    expect((await loadBuildingMembers(fakeDb(w) as any, { id: B1, founder_id: "u2" })).error).toBe(true);
    const w2 = world();
    w2.account_blocks = { error: { code: "57014", message: "timeout" } };
    expect((await loadBuildingMembers(fakeDb(w2) as any, { id: B1, founder_id: "u2" })).error).toBe(true);
    const w3 = world();
    w3.account_blocks = { error: { code: "42P01", message: "relation does not exist" } };
    expect((await loadBuildingMembers(fakeDb(w3) as any, { id: B1, founder_id: "u2" })).error).toBe(false);
  });

  it("'head' only for an active committee member (a founder_id that points at a tenant is not shown as head)", async () => {
    const r = await loadBuildingMembers(fakeDb(world()) as any, { id: B1, founder_id: "u1" });
    expect(r.members.filter((m) => m.head).map((m) => m.id)).toEqual([]);
  });
});
