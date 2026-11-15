// KEYS-1: /api/keys — GET (any staff with a full session) → bloc status; POST dry_run / reencrypt (security.manage = super-admin)
// → the signed bloc call (C3) with the actor from the session; validation, bloc errors in Hebrew, the panel log, and nothing that
// is not on the whitelist (never a key) reaching the browser.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import {
  NO_CURRENT_KEY_TEXT, PAYMENT_NOT_MOVABLE_TEXT, READ_FAILED_TEXT, WRITE_FAILED_TEXT, REENCRYPT_UNAVAILABLE_TEXT, STATUS_SHAPE_TEXT,
  RUN_SHAPE_TEXT, NOTE_REQUIRED_TEXT, NOTE_SECRET_TEXT, DRY_RUN_REQUIRED_TEXT,
} from "@/lib/encryptionKeys";

let guardImpl: (o: unknown) => unknown;
const guardCalls: unknown[] = [];
let blocAnswer: any;
const blocCalls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
vi.mock("@/lib/guard", () => ({ guard: async (o?: unknown) => { guardCalls.push(o); return guardImpl(o); } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { blocCalls.push({ path, payload }); return blocAnswer; } }));

// synthetic (a fixed pattern) — never a real key
const HEX64 = Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(i * 5 + 1) % 16]).join("");
const SESSION = { id: "a1111111-1111-4111-8111-111111111111", email: "tal@bloc.test", full_name: "טל", role: "superadmin", auth_level: "mfa" };
const ACTOR = { id: SESSION.id, email: SESSION.email, role: "superadmin" };
const counts = { rows: 40, legacy: 50, oldKid: 10, current: 20, unreadable: 0 };
const statusData = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  kinds: [
    { kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts, ...extra },
    { kind: "payment", configured: false, valid: false, currentKid: null, kids: [], counts: { rows: 0, legacy: 0, oldKid: 0, current: 0, unreadable: 0 } },
  ],
  payment: { movable: false },
});
// C5: bloc's signed dry-run token (synthetic signature)
const TOKEN = `kd1.supplier_bank.k2.1763197200000.${("Zx9_-" + "a1B2c3D4e5".repeat(4)).slice(0, 43)}`;
const dryData = { ok: true, dryRun: true, counts: { scanned: 40, wouldUpdate: 60, conflicts: 0, unreadable: 0, remaining: 0 }, dryRunToken: TOKEN };
const realData = { ok: true, dryRun: false, counts: { scanned: 40, updated: 58, conflicts: 2, unreadable: 0, remaining: 0 } };
const NOTE = "הוגדר k2 ב-Vercel של bloc";

const req = (body: unknown, xff: string | null = "1.2.3.4, 10.0.0.1"): any => ({
  json: async () => body,
  headers: { get: (k: string) => (k.toLowerCase() === "x-forwarded-for" ? xff : null) },
});
const get = async () => (await import("../route")).GET();
const post = async (body: unknown, xff?: string | null) => (await import("../route")).POST(req(body, xff));

beforeEach(() => {
  guardImpl = () => ({ ok: true, session: SESSION });
  guardCalls.length = 0; blocCalls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: statusData() };
});

describe("GET /api/keys — status", () => {
  it("any staff with a full session (guard without a permission, like the security page); bloc gets exactly { action: 'status' }", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(guardCalls).toEqual([undefined]);
    expect(blocCalls).toEqual([{ path: "/api/internal/keys", payload: { action: "status" } }]);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.status.supplierBank).toEqual({ kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts });
    expect(j.status.payment.kind).toBe("payment");
    expect(typeof j.checkedAt).toBe("string");
    expect(audits).toEqual([]);
  });
  it("a refused session stops before bloc", async () => {
    guardImpl = () => ({ ok: false, response: NextResponse.json({ error: "ההתחברות לפאנל הסתיימה" }, { status: 401 }) });
    const res = await get();
    expect(res.status).toBe(401);
    expect(blocCalls).toEqual([]);
  });
  it("never a key: extra fields from bloc and a 64-hex 'kid' do not reach the browser", async () => {
    blocAnswer = { ok: true, status: 200, data: { ...statusData({ key: HEX64, kids: ["k2", HEX64] }), secret: `k2:${HEX64}` } };
    const res = await get();
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(HEX64);
    expect(JSON.parse(text).status.supplierBank.kids).toEqual(["k2"]);
  });
  it("bloc 503 (a read failed) → 503 in Hebrew, no numbers (never '0')", async () => {
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read failed" };
    const res = await get();
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j).toEqual({ error: READ_FAILED_TEXT.status, code: "read_failed" });
  });
  it("callBloc's own errors keep their message (not configured, rejected signature, timeout)", async () => {
    for (const a of [
      { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר" },
      { ok: false, status: 502, code: "REJECTED", error: "bloc דחה את הבקשה" },
      { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן" },
    ]) {
      blocAnswer = a;
      const res = await get();
      expect(res.status).toBe(a.status);
      expect(await res.json()).toEqual({ error: a.error, code: a.code });
    }
  });
  it("an answer without the status (old bloc / wrong shape) → 502, not an empty card", async () => {
    for (const data of [{ ok: true }, { ok: true, kinds: [] }, { ok: true, kinds: [{ kind: "supplier_bank" }] }]) {
      blocAnswer = { ok: true, status: 200, data };
      const res = await get();
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: STATUS_SHAPE_TEXT, code: "bad_shape" });
    }
  });
});

describe("POST /api/keys — permission", () => {
  it("security.manage is super-admin only", () => {
    expect(can("superadmin", "security.manage")).toBe(true);
    expect(can("admin", "security.manage")).toBe(false);
    expect(can("viewer", "security.manage")).toBe(false);
  });
  it("asks guard for security.manage; a refusal → no bloc call, no log", async () => {
    guardImpl = () => ({ ok: false, response: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }) });
    const res = await post({ action: "dry_run", kind: "supplier_bank" });
    expect(guardCalls).toEqual([{ permission: "security.manage" }]);
    expect(res.status).toBe(403);
    expect(blocCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe("POST /api/keys — validation", () => {
  it.each([
    ["unknown action", { action: "rotate", kind: "supplier_bank" }],
    ["unknown kind", { action: "dry_run", kind: "buildings" }],
    ["no kind", { action: "dry_run" }],
    ["re-encrypt without a note", { action: "reencrypt", kind: "supplier_bank" }],
    ["re-encrypt with a short note", { action: "reencrypt", kind: "supplier_bank", note: "קצר" }],
    ["note of spaces", { action: "reencrypt", kind: "supplier_bank", note: "               " }],
    ["actor from the browser", { action: "dry_run", kind: "supplier_bank", actor: "evil@x.y" }],
    ["batch size from the browser", { action: "dry_run", kind: "supplier_bank", limit: 100000 }],
    ["dryRun flag from the browser", { action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRun: false }],
  ])("%s → 400, no bloc call, no log", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
  it("the note rule is said in Hebrew", async () => {
    const j = await (await post({ action: "reencrypt", kind: "supplier_bank", note: "קצר" })).json();
    expect(j.error).toBe(NOTE_REQUIRED_TEXT);
  });
  it("a key pasted into the note → 400 with the Hebrew reason, the key is not echoed back, nothing sent", async () => {
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: `המפתח החדש k2:${HEX64}` });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain(HEX64);
    expect(JSON.parse(text).error).toBe(NOTE_SECRET_TEXT);
    expect(blocCalls).toEqual([]);
  });
  it("a body that is not JSON → 400", async () => {
    const res = await (await import("../route")).POST({ json: async () => { throw new Error("x"); }, headers: { get: () => null } } as any);
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
  it("payment secrets do not move from here: 409 payment_not_movable before any bloc call", async () => {
    for (const body of [{ action: "dry_run", kind: "payment" }, { action: "reencrypt", kind: "payment", note: NOTE }, { action: "reencrypt", kind: "payment" }]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(await res.json()).toEqual({ error: PAYMENT_NOT_MOVABLE_TEXT, code: "payment_not_movable" });
    }
    expect(blocCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe("POST /api/keys — the signed bloc call (C3)", () => {
  it("dry run → reencrypt with dryRun true, the 200 batch, the actor from the session (with its role, for bloc's own check), no note key when there is none; logged", async () => {
    blocAnswer = { ok: true, status: 200, data: dryData };
    const res = await post({ action: "dry_run", kind: "supplier_bank" });
    expect(res.status).toBe(200);
    expect(blocCalls).toEqual([{ path: "/api/internal/keys", payload: { action: "reencrypt", kind: "supplier_bank", dryRun: true, limit: 200, actor: ACTOR } }]);
    expect("note" in blocCalls[0].payload).toBe(false);
    expect(await res.json()).toEqual({ ok: true, result: { kind: "supplier_bank", dryRun: true, counts: { scanned: 40, changed: 60, conflicts: 0, unreadable: 0, remaining: 0 }, dryRunToken: TOKEN } });
    expect(audits).toHaveLength(1);
    const [who, action, entity, id, meta, ip] = audits[0];
    expect(who).toBe(SESSION);
    expect(action).toBe("KEYS_DRY_RUN");
    expect([entity, id]).toEqual(["encryption_keys", "supplier_bank"]);
    expect(meta).toEqual({ kind: "supplier_bank", dry_run: true, counts: { scanned: 40, changed: 60, conflicts: 0, unreadable: 0, remaining: 0 }, actor_email: "tal@bloc.test" });
    expect(ip).toBe("1.2.3.4");
  });
  it("re-encrypt → dryRun false with the trimmed note; logged with the counts and the note", async () => {
    blocAnswer = { ok: true, status: 200, data: realData };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: `   ${NOTE}  `, dryRunToken: TOKEN }, null);
    expect(res.status).toBe(200);
    expect(blocCalls[0].payload).toEqual({ action: "reencrypt", kind: "supplier_bank", dryRun: false, limit: 200, actor: ACTOR, note: NOTE, dryRunToken: TOKEN });
    expect((await res.json()).result).toEqual({ kind: "supplier_bank", dryRun: false, counts: { scanned: 40, changed: 58, conflicts: 2, unreadable: 0, remaining: 0 } });
    expect(audits[0][1]).toBe("KEYS_REENCRYPT");
    expect(audits[0][4]).toEqual({ kind: "supplier_bank", dry_run: false, counts: { scanned: 40, changed: 58, conflicts: 2, unreadable: 0, remaining: 0 }, actor_email: "tal@bloc.test", note: NOTE });
    expect(audits[0][5]).toBeUndefined();
  });
  it("a dry run with a note forwards it", async () => {
    blocAnswer = { ok: true, status: 200, data: dryData };
    await post({ action: "dry_run", kind: "supplier_bank", note: "בדיקה לפני" });
    expect(blocCalls[0].payload.note).toBe("בדיקה לפני");
  });
});

describe("POST /api/keys — dry run first, enforced on the server (C5)", () => {
  it("the dry run's token reaches the browser (result.dryRunToken) but not the log", async () => {
    blocAnswer = { ok: true, status: 200, data: dryData };
    const j = await (await post({ action: "dry_run", kind: "supplier_bank" })).json();
    expect(j.result.dryRunToken).toBe(TOKEN);
    expect(JSON.stringify(audits)).not.toContain(TOKEN);
  });
  it("a token from bloc in any other shape (or for another kind) is dropped", async () => {
    for (const bad of [TOKEN.slice(0, -1), TOKEN.replace("kd1.", "kd9."), TOKEN.replace("supplier_bank", "payment"), `${TOKEN}<script>`]) {
      blocAnswer = { ok: true, status: 200, data: { ...dryData, dryRunToken: bad } };
      const j = await (await post({ action: "dry_run", kind: "supplier_bank" })).json();
      expect("dryRunToken" in j.result, bad).toBe(false);
      expect(j.result.counts.changed).toBe(60);
    }
  });
  it.each([
    ["no token", {}],
    ["a blank token", { dryRunToken: "   " }],
    ["a token in another shape", { dryRunToken: TOKEN.slice(0, -1) }],
    ["a token for another format", { dryRunToken: TOKEN.replace("kd1.", "kd2.") }],
  ])("re-encrypt with %s → 400 dry_run_required in Hebrew, no bloc call, no log", async (_n, extra) => {
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, ...extra });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: DRY_RUN_REQUIRED_TEXT, code: "dry_run_required" });
    expect(blocCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
  it("a token longer than 300 → 400 (schema), no bloc call", async () => {
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: "x".repeat(301) });
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
  it("the real run forwards the token; a dry run never forwards one", async () => {
    blocAnswer = { ok: true, status: 200, data: realData };
    await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(blocCalls[0].payload.dryRunToken).toBe(TOKEN);
    blocAnswer = { ok: true, status: 200, data: dryData };
    await post({ action: "dry_run", kind: "supplier_bank", dryRunToken: TOKEN });
    expect("dryRunToken" in blocCalls[1].payload).toBe(false);
  });
  it("payment is refused before the token check (409, not 400)", async () => {
    const res = await post({ action: "reencrypt", kind: "payment", note: NOTE });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("payment_not_movable");
  });
  it("bloc 409 dry_run_required (old / another key / another admin / tampered) → the Hebrew text, nothing logged", async () => {
    blocAnswer = { ok: false, status: 409, code: "dry_run_required", error: "dry_run_required" };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: DRY_RUN_REQUIRED_TEXT, code: "dry_run_required" });
    expect(audits).toEqual([]);
  });
});

describe("POST /api/keys — bloc's answers", () => {
  it("409 no_current_key → Hebrew (how to set the key), code kept, nothing logged", async () => {
    blocAnswer = { ok: false, status: 409, code: "no_current_key", error: "no_current_key" };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: NO_CURRENT_KEY_TEXT, code: "no_current_key" });
    expect(audits).toEqual([]);
  });
  it("409 payment_not_movable from bloc → the same Hebrew", async () => {
    blocAnswer = { ok: false, status: 409, code: "payment_not_movable", error: "x" };
    const res = await post({ action: "dry_run", kind: "supplier_bank" });
    expect(await res.json()).toEqual({ error: PAYMENT_NOT_MOVABLE_TEXT, code: "payment_not_movable" });
  });
  it("503 read_failed → nothing changed (dry run or batch), nothing logged", async () => {
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "x" };
    let res = await post({ action: "dry_run", kind: "supplier_bank" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(READ_FAILED_TEXT.dry_run);
    res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(READ_FAILED_TEXT.reencrypt);
    expect(audits).toEqual([]);
  });
  it("503 write_failed on a batch → 'stopped half way', logged as partial", async () => {
    blocAnswer = { ok: false, status: 503, code: "write_failed", error: "x" };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: WRITE_FAILED_TEXT, code: "write_failed" });
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("KEYS_REENCRYPT_PARTIAL");
    expect(audits[0][4]).toEqual({ kind: "supplier_bank", dry_run: false, outcome: "partial", error: "write_failed", actor_email: "tal@bloc.test", note: NOTE });
  });
  it("a server error on a batch (500, or 503 without a code) → logged as unknown", async () => {
    blocAnswer = { ok: false, status: 500, code: "failed", error: "הפעולה נכשלה" };
    let res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(500);
    blocAnswer = { ok: false, status: 503, error: "x" };
    res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(await res.json()).toEqual({ error: REENCRYPT_UNAVAILABLE_TEXT, code: "unavailable" });
    expect(audits.map((a) => [a[1], a[4].error])).toEqual([["KEYS_REENCRYPT_UNKNOWN", "failed"], ["KEYS_REENCRYPT_UNKNOWN", "http_503"]]);
  });
  it("the same failures on a dry run are never logged (a dry run writes nothing)", async () => {
    for (const a of [{ status: 503, code: "write_failed" }, { status: 500, code: "failed" }, { status: 504, code: "TIMEOUT" }]) {
      blocAnswer = { ok: false, error: "x", ...a };
      await post({ action: "dry_run", kind: "supplier_bank" });
    }
    expect(audits).toEqual([]);
  });
  it("a timeout on a real batch → its message, and the log says 'unknown' (it may have run)", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה" };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain("ייתכן שהפעולה בוצעה");
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("KEYS_REENCRYPT_UNKNOWN");
    expect(audits[0][4]).toEqual({ kind: "supplier_bank", dry_run: false, outcome: "unknown", error: "TIMEOUT", actor_email: "tal@bloc.test", note: NOTE });
  });
  it("a timeout on a dry run is not logged (nothing could have changed)", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "x" };
    await post({ action: "dry_run", kind: "supplier_bank" });
    expect(audits).toEqual([]);
  });
  it("a rejected signature (502) on a real batch is not 'unknown' — bloc did not run it", async () => {
    blocAnswer = { ok: false, status: 502, code: "REJECTED", error: "bloc דחה" };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(502);
    expect(audits).toEqual([]);
  });
  it("an answer in the wrong shape: dry → 502, nothing shown or logged; real → 502 + 'unknown' in the log", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, dryRun: false, counts: realData.counts } };   // asked dry, bloc says real
    let res = await post({ action: "dry_run", kind: "supplier_bank" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: RUN_SHAPE_TEXT.dry_run, code: "bad_shape" });
    expect(audits).toEqual([]);
    blocAnswer = { ok: true, status: 200, data: { ok: true } };
    res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(RUN_SHAPE_TEXT.reencrypt);
    expect(audits.map((a) => [a[1], a[4].error])).toEqual([["KEYS_REENCRYPT_UNKNOWN", "bad_shape"]]);
  });
  it("only whitelisted counts reach the browser and the log", async () => {
    blocAnswer = { ok: true, status: 200, data: { ...realData, sample: HEX64, counts: { ...realData.counts, debug: HEX64 } } };
    const res = await post({ action: "reencrypt", kind: "supplier_bank", note: NOTE, dryRunToken: TOKEN });
    expect(await res.text()).not.toContain(HEX64);
    expect(JSON.stringify(audits)).not.toContain(HEX64);
  });
});
