// KEYS-1 (bloc, decisions 358–360): what the panel reads from bloc (whitelist, kid shape, counts never invented), when a dry run
// is still good, when re-encryption is blocked, the note (required, length, no pasted key), the POST schema, and bloc's errors in Hebrew.
// C5 (review P2): the dry-run token — whitelisted from bloc's answer, kept with the fresh dry run, sent with the real run.
import { describe, it, expect } from "vitest";
import {
  parseKeysStatus, parseRunResult, hasCurrentKey, keyTag, noKeyText, currentShare, isEmptyStatus,
  fingerprint, makeDryRun, dryRunState, dryRunBlock, reencryptBlock, looksLikeSecret, checkNote, keysFailure,
  failedRunOutcome, afterDryRun, afterReencrypt, agoText, DRY_RUN_TTL_MS, DRY_RUN_DONE_TEXT, NET_ERROR_TEXT, RUN_NET_ERROR_TEXT, STALE_TEXT, ONLY_SUPERADMIN_TEXT, NEED_DRY_RUN_TEXT, NOTHING_TO_DO_TEXT, NOTE_REQUIRED_TEXT,
  NOTE_TOO_LONG_TEXT, NOTE_SECRET_TEXT, NO_CURRENT_KEY_TEXT, PAYMENT_NOT_MOVABLE_TEXT, READ_FAILED_TEXT, WRITE_FAILED_TEXT,
  REENCRYPT_UNAVAILABLE_TEXT, NOTE_MAX, NO_TOKEN_TEXT, DRY_RUN_REQUIRED_TEXT, isDryRunToken, dryRunBody, reencryptBody,
  type KindStatus, type RunResult,
} from "../encryptionKeys";
import { keysActionSchema } from "../validation";

// synthetic (a fixed pattern) — never a real key
const HEX64 = Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(i * 7 + 3) % 16]).join("");
const counts = { rows: 40, legacy: 50, oldKid: 10, current: 20, unreadable: 0 };
const sb = (o: Partial<KindStatus> = {}): KindStatus => ({
  kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts: { ...counts }, ...o,
});
const blocStatus = (kind: Record<string, unknown> = {}) => ({
  ok: true,
  kinds: [{ kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts, ...kind }],
  payment: { movable: false },
});
// C5 dry-run token: kd1.<kind>.<kid>.<13-digit ms>.<43-char base64url> — synthetic signature
const SIG = ("Zx9_-" + "a1B2c3D4e5".repeat(4)).slice(0, 43);
const TOKEN = `kd1.supplier_bank.k2.1763197200000.${SIG}`;
const dryResult = (o: Partial<RunResult["counts"]> = {}, token: string | null = TOKEN): RunResult => ({
  kind: "supplier_bank", dryRun: true, counts: { scanned: 40, changed: 60, conflicts: 0, unreadable: 0, remaining: 0, ...o },
  ...(token ? { dryRunToken: token } : {}),
});
const T0 = Date.parse("2026-11-15T09:00:00Z");

describe("parseKeysStatus — only whitelisted fields, never a key", () => {
  it("normalizes bloc's status (C3) into supplierBank + payment", () => {
    const s = parseKeysStatus({
      ...blocStatus(),
      kinds: [...blocStatus().kinds, { kind: "payment", configured: false, valid: false, currentKid: null, kids: [], counts: { rows: 3, legacy: 3, oldKid: 0, current: 0, unreadable: 0 } }],
    });
    expect(s).toEqual({
      supplierBank: { kind: "supplier_bank", configured: true, valid: true, currentKid: "k2", kids: ["k2", "k1"], counts },
      payment: { kind: "payment", configured: false, valid: false, currentKid: null, kids: [], counts: { rows: 3, legacy: 3, oldKid: 0, current: 0, unreadable: 0 } },
    });
  });
  it("extra fields (even a key someone added by mistake) do not come through", () => {
    const s = parseKeysStatus({ ...blocStatus({ key: HEX64, secret: `k2:${HEX64}`, keyMaterial: HEX64 }), env: { ENCRYPTION_KEYS_SUPPLIER_BANK: `k2:${HEX64}` } });
    expect(s).not.toBeNull();
    expect(JSON.stringify(s)).not.toContain(HEX64);
    expect(Object.keys(s!.supplierBank).sort()).toEqual(["configured", "counts", "currentKid", "kids", "kind", "valid"]);
  });
  it("a kid is shown only as [a-z0-9]{1,8}: a 64-hex value in currentKid / kids is dropped", () => {
    const s = parseKeysStatus(blocStatus({ currentKid: HEX64, kids: [HEX64, "k1", "K2", "toolongkid", "k1", 7] }))!;
    expect(s.supplierBank.currentKid).toBeNull();
    expect(s.supplierBank.kids).toEqual(["k1"]);
    expect(hasCurrentKey(s.supplierBank)).toBe(false);
  });
  it("counts that are missing, negative, fractional or strings → null (shown as unknown, never 0)", () => {
    for (const bad of [undefined, null, {}, { ...counts, legacy: -1 }, { ...counts, current: 1.5 }, { ...counts, rows: "40" }, { ...counts, unreadable: undefined }]) {
      expect(parseKeysStatus(blocStatus({ counts: bad }))!.supplierBank.counts, JSON.stringify(bad)).toBeNull();
    }
  });
  it("no kinds array, or no supplier_bank entry, or a broken supplier_bank entry → null", () => {
    expect(parseKeysStatus(null)).toBeNull();
    expect(parseKeysStatus({ ok: true })).toBeNull();
    expect(parseKeysStatus({ kinds: "x" })).toBeNull();
    expect(parseKeysStatus({ kinds: [{ kind: "payment", configured: false, valid: false, kids: [], counts }] })).toBeNull();
    expect(parseKeysStatus(blocStatus({ configured: "yes" }))).toBeNull();
    expect(parseKeysStatus({ kinds: [{ kind: "other", configured: true, valid: true }] })).toBeNull();
  });
  it("no payment entry → payment null", () => {
    expect(parseKeysStatus(blocStatus())!.payment).toBeNull();
  });
});

describe("C5 — the dry-run token", () => {
  const dc = { scanned: 40, wouldUpdate: 60, conflicts: 0, unreadable: 0, remaining: 0 };
  it("the shape: kd1.<kind>.<kid>.<13 digits>.<43 base64url>", () => {
    expect(SIG).toHaveLength(43);
    expect(isDryRunToken(TOKEN)).toBe(true);
    for (const bad of [
      TOKEN.replace("kd1.", "kd2."), TOKEN.replace("supplier_bank", "Supplier_bank"), TOKEN.replace(".k2.", ".k2345678x."),
      TOKEN.replace(".k2.", ".K2."), TOKEN.replace("1763197200000", "176319720000"), TOKEN.replace("1763197200000", "17631972000001"),
      TOKEN.slice(0, -1), TOKEN + "A", TOKEN.slice(0, -1) + "+", TOKEN.slice(0, -1) + "=", ` ${TOKEN}`, `${TOKEN}\n`, "", 42, null, undefined,
    ]) expect(isDryRunToken(bad), String(bad)).toBe(false);
  });
  it("a dry run passes bloc's token to the browser — only in that shape and only for the kind asked", () => {
    expect(parseRunResult({ ok: true, dryRun: true, counts: dc, dryRunToken: TOKEN }, "supplier_bank", true)?.dryRunToken).toBe(TOKEN);
    const bad = parseRunResult({ ok: true, dryRun: true, counts: dc, dryRunToken: TOKEN.slice(0, -1) }, "supplier_bank", true);
    expect(bad).not.toBeNull();
    expect(bad && "dryRunToken" in bad).toBe(false);
    const other = parseRunResult({ ok: true, dryRun: true, counts: dc, dryRunToken: TOKEN.replace("supplier_bank", "payment") }, "supplier_bank", true);
    expect(other && "dryRunToken" in other).toBe(false);
    expect(parseRunResult({ ok: true, dryRun: true, counts: dc }, "supplier_bank", true)?.dryRunToken).toBeUndefined();
  });
  it("a real run never carries a token", () => {
    const r = parseRunResult({ ok: true, dryRun: false, counts: { ...dc, updated: 60 }, dryRunToken: TOKEN }, "supplier_bank", false);
    expect(r && "dryRunToken" in r).toBe(false);
  });
  it("the dry run keeps its token; the real run's body carries it; no dry run (or no token) → no token in the body", () => {
    const dry = makeDryRun(dryResult(), sb(), T0);
    expect(dry.token).toBe(TOKEN);
    expect(makeDryRun(dryResult({}, null), sb(), T0).token).toBeNull();
    expect(reencryptBody("הוגדר k2 ב-Vercel", dry)).toEqual({ action: "reencrypt", kind: "supplier_bank", note: "הוגדר k2 ב-Vercel", dryRunToken: TOKEN });
    expect(reencryptBody("הוגדר k2 ב-Vercel", null)).toEqual({ action: "reencrypt", kind: "supplier_bank", note: "הוגדר k2 ב-Vercel" });
    expect(reencryptBody("הוגדר k2 ב-Vercel", { ...dry, token: null })).toEqual({ action: "reencrypt", kind: "supplier_bank", note: "הוגדר k2 ב-Vercel" });
    expect(reencryptBody(undefined, dry)).toEqual({ action: "reencrypt", kind: "supplier_bank", dryRunToken: TOKEN });
    expect(dryRunBody()).toEqual({ action: "dry_run", kind: "supplier_bank" });
  });
  it("a fresh dry run without a token does not open re-encryption", () => {
    expect(reencryptBlock(sb(), makeDryRun(dryResult(), sb(), T0), T0, true)).toBeNull();
    expect(reencryptBlock(sb(), makeDryRun(dryResult({}, null), sb(), T0), T0, true)).toBe(NO_TOKEN_TEXT);
  });
  it("bloc's 409 dry_run_required → the Hebrew text, code kept", () => {
    expect(keysFailure({ status: 409, code: "dry_run_required", error: "x" }, "reencrypt")).toEqual({ status: 409, code: "dry_run_required", error: DRY_RUN_REQUIRED_TEXT });
    expect(DRY_RUN_REQUIRED_TEXT).toBe("צריך ריצת ניסיון טרייה — עד 10 דקות, באותו מפתח. מריצים ניסיון ואז מאשרים.");
  });
  it("after dry_run_required (bloc 409 or the panel's 400) the dry run and its token are dropped, like after a failed batch", () => {
    for (const status of [409, 400]) {
      const o = afterReencrypt({ ok: false, status, j: { error: DRY_RUN_REQUIRED_TEXT, code: "dry_run_required" } }, T0);
      expect(o, String(status)).toEqual({ last: null, keepDry: false, confirmOpen: false, clearNote: false, noteError: null, msg: { ok: false, text: DRY_RUN_REQUIRED_TEXT, login: false }, reload: true });
    }
  });
});

describe("parseRunResult — the counts of a run", () => {
  it("dry run reads wouldUpdate; a real run reads updated", () => {
    expect(parseRunResult({ ok: true, dryRun: true, counts: { scanned: 40, wouldUpdate: 60, conflicts: 0, unreadable: 2, remaining: 5 } }, "supplier_bank", true))
      .toEqual({ kind: "supplier_bank", dryRun: true, counts: { scanned: 40, changed: 60, conflicts: 0, unreadable: 2, remaining: 5 } });
    expect(parseRunResult({ ok: true, dryRun: false, counts: { scanned: 40, updated: 58, conflicts: 2, unreadable: 2, remaining: 5 } }, "supplier_bank", false))
      .toEqual({ kind: "supplier_bank", dryRun: false, counts: { scanned: 40, changed: 58, conflicts: 2, unreadable: 2, remaining: 5 } });
  });
  it("a dry run answered as a real run (or the other way round) → null", () => {
    expect(parseRunResult({ dryRun: false, counts: { scanned: 1, updated: 1, wouldUpdate: 1, conflicts: 0, unreadable: 0, remaining: 0 } }, "supplier_bank", true)).toBeNull();
    expect(parseRunResult({ dryRun: true, counts: { scanned: 1, updated: 1, wouldUpdate: 1, conflicts: 0, unreadable: 0, remaining: 0 } }, "supplier_bank", false)).toBeNull();
  });
  it("the wrong count name for the mode, a missing or negative count → null", () => {
    expect(parseRunResult({ dryRun: true, counts: { scanned: 1, updated: 1, conflicts: 0, unreadable: 0, remaining: 0 } }, "supplier_bank", true)).toBeNull();
    expect(parseRunResult({ dryRun: false, counts: { scanned: 1, wouldUpdate: 1, conflicts: 0, unreadable: 0, remaining: 0 } }, "supplier_bank", false)).toBeNull();
    expect(parseRunResult({ dryRun: true, counts: { scanned: 1, wouldUpdate: 1, conflicts: 0, unreadable: 0 } }, "supplier_bank", true)).toBeNull();
    expect(parseRunResult({ dryRun: true, counts: { scanned: 1, wouldUpdate: -1, conflicts: 0, unreadable: 0, remaining: 0 } }, "supplier_bank", true)).toBeNull();
    expect(parseRunResult({ dryRun: true }, "supplier_bank", true)).toBeNull();
    expect(parseRunResult(null, "supplier_bank", true)).toBeNull();
  });
  it("extra fields in the counts are not forwarded", () => {
    const r = parseRunResult({ dryRun: true, counts: { scanned: 1, wouldUpdate: 1, conflicts: 0, unreadable: 0, remaining: 0, sample: HEX64 } }, "supplier_bank", true);
    expect(JSON.stringify(r)).not.toContain(HEX64);
  });
});

describe("key state", () => {
  it("configured + valid + kid → a current key (green, with the kid)", () => {
    expect(hasCurrentKey(sb())).toBe(true);
    expect(keyTag(sb())).toEqual({ tone: "ok", text: "מפתח נוכחי" });
    expect(noKeyText(sb())).toBeNull();
  });
  it("missing → 'not set': writes stay on the old key, nothing breaks; names the env var, no value", () => {
    const s = sb({ configured: false, valid: false, currentKid: null, kids: [] });
    expect(keyTag(s)).toEqual({ tone: "wait", text: "לא הוגדר מפתח" });
    const t = noKeyText(s)!;
    expect(t).toContain("ENCRYPTION_KEYS_SUPPLIER_BANK");
    expect(t).toContain("נשארות על המפתח הישן");
    expect(t).toContain("שום דבר לא נשבר");
  });
  it("malformed → red, how to fix it", () => {
    const s = sb({ configured: true, valid: false, currentKid: null });
    expect(keyTag(s)).toEqual({ tone: "danger", text: "הגדרה פגומה" });
    expect(noKeyText(s)).toContain("פגומה");
    expect(noKeyText(s)).toContain("kid:64hex");
  });
  it("malformed even when bloc still names a kid → not a current key (writes stay legacy until it is fixed)", () => {
    const s = sb({ valid: false, currentKid: "k2" });
    expect(hasCurrentKey(s)).toBe(false);
    expect(keyTag(s)).toEqual({ tone: "danger", text: "הגדרה פגומה" });
    expect(dryRunBlock(s, true)).toContain("פגומה");
    expect(reencryptBlock(s, makeDryRun(dryResult(), s, T0), T0, true)).toContain("פגומה");
  });
  it("valid but a kid that is not a kid → not a current key", () => {
    const s = sb({ currentKid: null });
    expect(hasCurrentKey(s)).toBe(false);
    expect(keyTag(s).tone).toBe("danger");
    expect(noKeyText(s)).toContain("מזהה מפתח לא תקין");
  });
  it("currentShare: current out of all values (unreadable included), rounded down — 100% only when all are current", () => {
    expect(currentShare({ rows: 10, legacy: 1, oldKid: 0, current: 199, unreadable: 0 })).toBe(99);
    expect(currentShare({ rows: 10, legacy: 0, oldKid: 0, current: 5, unreadable: 5 })).toBe(50);
    expect(currentShare({ rows: 10, legacy: 0, oldKid: 0, current: 7, unreadable: 0 })).toBe(100);
    expect(currentShare({ rows: 0, legacy: 0, oldKid: 0, current: 0, unreadable: 0 })).toBeNull();
  });
  it("empty = nothing stored (a count that did not arrive is not 'empty')", () => {
    expect(isEmptyStatus(sb({ counts: { rows: 0, legacy: 0, oldKid: 0, current: 0, unreadable: 0 } }))).toBe(true);
    expect(isEmptyStatus(sb({ counts: null }))).toBe(false);
    expect(isEmptyStatus(sb())).toBe(false);
    expect(isEmptyStatus(sb({ counts: { rows: 0, legacy: 1, oldKid: 0, current: 0, unreadable: 0 } }))).toBe(false);
  });
});

describe("dry run freshness", () => {
  const dry = makeDryRun(dryResult(), sb(), T0);
  it("no dry run (or another kind's) → none", () => {
    expect(dryRunState(null, sb(), T0)).toBe("none");
    expect(dryRunState({ ...dry, kind: "payment" }, sb(), T0)).toBe("none");
  });
  it("same status within 10 minutes → fresh; one millisecond later → stale_time; a clock that went back → stale_time", () => {
    expect(dryRunState(dry, sb(), T0 + DRY_RUN_TTL_MS)).toBe("fresh");
    expect(dryRunState(dry, sb(), T0 + DRY_RUN_TTL_MS + 1)).toBe("stale_time");
    expect(dryRunState(dry, sb(), T0 - 1)).toBe("stale_time");
  });
  it("the current key changed → stale_key", () => {
    expect(dryRunState(dry, sb({ currentKid: "k3", kids: ["k3", "k2", "k1"] }), T0)).toBe("stale_key");
  });
  it("counts changed (a supplier saved, another admin ran a batch) or the readable kids changed → stale_counts", () => {
    expect(dryRunState(dry, sb({ counts: { ...counts, legacy: 49, current: 21 } }), T0)).toBe("stale_counts");
    expect(dryRunState(dry, sb({ kids: ["k2"] }), T0)).toBe("stale_counts");
    expect(dryRunState(dry, sb({ counts: null }), T0)).toBe("stale_counts");
  });
  it("the fingerprint covers the key and every count", () => {
    const base = fingerprint(sb());
    for (const k of ["rows", "legacy", "oldKid", "current", "unreadable"] as const) {
      expect(fingerprint(sb({ counts: { ...counts, [k]: counts[k] + 1 } })), k).not.toBe(base);
    }
    expect(fingerprint(sb({ valid: false }))).not.toBe(base);
  });
});

describe("what blocks the buttons", () => {
  const fresh = makeDryRun(dryResult(), sb(), T0);
  it("dry run: super-admin with a current key only", () => {
    expect(dryRunBlock(sb(), true)).toBeNull();
    expect(dryRunBlock(sb(), false)).toBe(ONLY_SUPERADMIN_TEXT);
    expect(dryRunBlock(sb({ configured: false, valid: false, currentKid: null }), true)).toContain("ENCRYPTION_KEYS_SUPPLIER_BANK");
  });
  it("re-encrypt: needs a fresh dry run that found something", () => {
    expect(reencryptBlock(sb(), fresh, T0 + 60_000, true)).toBeNull();
    expect(reencryptBlock(sb(), null, T0, true)).toBe(NEED_DRY_RUN_TEXT);
    expect(reencryptBlock(sb(), fresh, T0 + DRY_RUN_TTL_MS + 1, true)).toBe(STALE_TEXT.stale_time);
    expect(reencryptBlock(sb({ currentKid: "k3" }), fresh, T0, true)).toBe(STALE_TEXT.stale_key);
    expect(reencryptBlock(sb({ counts: { ...counts, legacy: 1 } }), fresh, T0, true)).toBe(STALE_TEXT.stale_counts);
    expect(reencryptBlock(sb(), makeDryRun(dryResult({ changed: 0 }), sb(), T0), T0, true)).toBe(NOTHING_TO_DO_TEXT);
  });
  it("re-encrypt: never without a key or for a non-super-admin, even with a fresh dry run", () => {
    expect(reencryptBlock(sb(), fresh, T0, false)).toBe(ONLY_SUPERADMIN_TEXT);
    const noKey = sb({ configured: true, valid: false, currentKid: null });
    expect(reencryptBlock(noKey, makeDryRun(dryResult(), noKey, T0), T0, true)).toContain("פגומה");
  });
});

describe("the note", () => {
  it("required for re-encryption: 10+ characters after trim", () => {
    expect(checkNote("קצר", true)).toEqual({ ok: false, error: NOTE_REQUIRED_TEXT });
    expect(checkNote("            ", true)).toEqual({ ok: false, error: NOTE_REQUIRED_TEXT });
    expect(checkNote(undefined, true)).toEqual({ ok: false, error: NOTE_REQUIRED_TEXT });
    expect(checkNote("  הוגדר k2 ב-Vercel של bloc  ", true)).toEqual({ ok: true, value: "הוגדר k2 ב-Vercel של bloc" });
  });
  it("exactly 10 characters is enough; 9 is not", () => {
    expect(checkNote("א".repeat(10), true)).toEqual({ ok: true, value: "א".repeat(10) });
    expect(checkNote("א".repeat(9), true).ok).toBe(false);
  });
  it("optional for a dry run (empty → no note)", () => {
    expect(checkNote("", false)).toEqual({ ok: true, value: undefined });
    expect(checkNote(undefined, false)).toEqual({ ok: true, value: undefined });
    expect(checkNote("בדיקה", false)).toEqual({ ok: true, value: "בדיקה" });
  });
  it(`at most ${NOTE_MAX} characters`, () => {
    expect(checkNote("א".repeat(NOTE_MAX), true).ok).toBe(true);
    expect(checkNote("א".repeat(NOTE_MAX + 1), true)).toEqual({ ok: false, error: NOTE_TOO_LONG_TEXT });
  });
  it("a pasted key is refused (hex, kid:hex, base64) — the message does not repeat it", () => {
    for (const n of [`המפתח החדש ${HEX64}`, `k2:${HEX64}`, `hex ${HEX64.slice(0, 32)}`, "base64 q7Lm2xV9pR4tK8wZ1nB6cJ3hF5sD0gYaE2uI7oP9rT4=", "token Zm9vYmFyMTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A"]) {
      const r = checkNote(n, true);
      expect(r, n).toEqual({ ok: false, error: NOTE_SECRET_TEXT });
      expect(NOTE_SECRET_TEXT).not.toContain(HEX64);
    }
  });
  it("ordinary notes pass: Hebrew, a kid, a URL path, a UUID, a short commit", () => {
    for (const n of [
      "הוגדר k2 ב-Vercel של bloc אחרי KEYS-1",
      "ראו https://vercel.com/team/bloc/settings/environment-variables",
      "בקשה c1111111-1111-4111-8111-111111111111 טופלה",
      "אחרי הפריסה של 056e495, סבב ראשון",
    ]) {
      expect(looksLikeSecret(n), n).toBe(false);
      expect(checkNote(n, true).ok, n).toBe(true);
    }
  });
});

describe("POST schema", () => {
  it("accepts the dry-run token as a string up to 300 (trimmed; blank → none); longer → invalid", () => {
    const r = keysActionSchema.safeParse({ action: "reencrypt", kind: "supplier_bank", note: "הוגדר k2 ב-Vercel", dryRunToken: ` ${TOKEN} ` });
    expect(r.success && r.data.dryRunToken).toBe(TOKEN);
    const b = keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", dryRunToken: "   " });
    expect(b.success && b.data.dryRunToken).toBeUndefined();
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", dryRunToken: "x".repeat(300) }).success).toBe(true);
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", dryRunToken: "x".repeat(301) }).success).toBe(false);
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", dryRunToken: 7 }).success).toBe(false);
  });
  it("a dry run needs no note; re-encryption does", () => {
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank" }).success).toBe(true);
    expect(keysActionSchema.safeParse({ action: "reencrypt", kind: "supplier_bank" }).success).toBe(false);
    expect(keysActionSchema.safeParse({ action: "reencrypt", kind: "supplier_bank", note: "קצר" }).success).toBe(false);
  });
  it("trims the note; an empty note becomes undefined", () => {
    const r = keysActionSchema.safeParse({ action: "reencrypt", kind: "supplier_bank", note: "  הוגדר k2 ב-Vercel  " });
    expect(r.success && r.data).toEqual({ action: "reencrypt", kind: "supplier_bank", note: "הוגדר k2 ב-Vercel", dryRunToken: undefined });
    const d = keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", note: "   " });
    expect(d.success && d.data).toEqual({ action: "dry_run", kind: "supplier_bank", note: undefined, dryRunToken: undefined });
  });
  it("strict: the actor (or a batch size) cannot come from the browser", () => {
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", actor: "x@y.z" }).success).toBe(false);
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "supplier_bank", limit: 5000 }).success).toBe(false);
  });
  it("unknown action / kind → invalid; payment passes the schema so the route can answer 409 in Hebrew", () => {
    expect(keysActionSchema.safeParse({ action: "rotate", kind: "supplier_bank" }).success).toBe(false);
    expect(keysActionSchema.safeParse({ action: "dry_run", kind: "buildings" }).success).toBe(false);
    expect(keysActionSchema.safeParse({ action: "reencrypt", kind: "payment" }).success).toBe(true);
  });
  it("a pasted key fails with the Hebrew message", () => {
    const r = keysActionSchema.safeParse({ action: "reencrypt", kind: "supplier_bank", note: `k2:${HEX64}` });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe(NOTE_SECRET_TEXT);
  });
});

describe("bloc errors in Hebrew", () => {
  it("409 no_current_key → how to set the key", () => {
    expect(keysFailure({ status: 409, code: "no_current_key", error: "no_current_key" }, "reencrypt"))
      .toEqual({ status: 409, code: "no_current_key", error: NO_CURRENT_KEY_TEXT });
    expect(NO_CURRENT_KEY_TEXT).toContain("ENCRYPTION_KEYS_SUPPLIER_BANK");
  });
  it("409 payment_not_movable → stays on the old key until the owner moves his file", () => {
    expect(keysFailure({ status: 409, code: "payment_not_movable", error: "x" }, "dry_run"))
      .toEqual({ status: 409, code: "payment_not_movable", error: PAYMENT_NOT_MOVABLE_TEXT });
  });
  it("503 read_failed (bloc reads everything before it writes) → per step: no numbers, nothing changed", () => {
    for (const step of ["status", "dry_run", "reencrypt"] as const) {
      const f = keysFailure({ status: 503, code: "read_failed", error: "read failed" }, step);
      expect(f).toEqual({ status: 503, code: "read_failed", error: READ_FAILED_TEXT[step] });
    }
    expect(keysFailure({ status: 503, error: "x" }, "status").code).toBe("read_failed");
    expect(READ_FAILED_TEXT.status).toContain("לא 0");
    expect(READ_FAILED_TEXT.reencrypt).toContain("שום דבר לא שונה");
  });
  it("503 on a real batch: write_failed → stopped half way; any other 503 → may have run in part", () => {
    expect(keysFailure({ status: 503, code: "write_failed", error: "x" }, "reencrypt")).toEqual({ status: 503, code: "write_failed", error: WRITE_FAILED_TEXT });
    expect(WRITE_FAILED_TEXT).toContain("חלק מהערכים כבר הוצפנו מחדש");
    expect(keysFailure({ status: 503, error: "x" }, "reencrypt")).toEqual({ status: 503, code: "unavailable", error: REENCRYPT_UNAVAILABLE_TEXT });
    expect(keysFailure({ status: 503, code: "weird", error: "x" }, "reencrypt").error).toBe(REENCRYPT_UNAVAILABLE_TEXT);
    // ניסיון אף פעם לא כותב — גם write_failed (שלא אמור לקרות) לא נאמר כ"חלק הוצפנו"
    expect(keysFailure({ status: 503, code: "write_failed", error: "x" }, "dry_run").error).toBe(READ_FAILED_TEXT.dry_run);
  });
  it("callBloc's own 503 (not configured / panel calls itself) keeps its message", () => {
    expect(keysFailure({ status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר" }, "status"))
      .toEqual({ status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר" });
    expect(keysFailure({ status: 503, code: "SELF_URL", error: "BLOC_APP_URL מצביע על הפאנל" }, "dry_run").error).toBe("BLOC_APP_URL מצביע על הפאנל");
  });
  it("anything else passes through (connection, signature, other 409s)", () => {
    expect(keysFailure({ status: 502, code: "REJECTED", error: "bloc דחה" }, "status")).toEqual({ status: 502, code: "REJECTED", error: "bloc דחה" });
    expect(keysFailure({ status: 409, code: "busy", error: "רץ כבר סבב" }, "reencrypt")).toEqual({ status: 409, code: "busy", error: "רץ כבר סבב" });
    expect(keysFailure({ status: 400, error: "bad" }, "reencrypt")).toEqual({ status: 400, error: "bad" });
  });
});

describe("failedRunOutcome — may a failed real batch have written something?", () => {
  it("write_failed → partial", () => {
    expect(failedRunOutcome({ status: 503, code: "write_failed" })).toBe("partial");
  });
  it("no answer in time, a network error, a server error without a known code → unknown", () => {
    for (const r of [{ status: 504, code: "TIMEOUT" }, { status: 504, code: "NETWORK" }, { status: 500, code: "failed" }, { status: 503 }, { status: 502 }, { status: 500 }]) {
      expect(failedRunOutcome(r), JSON.stringify(r)).toBe("unknown");
    }
  });
  it("refused before any write, or never reached bloc's code → null", () => {
    for (const r of [
      { status: 409, code: "no_current_key" }, { status: 409, code: "payment_not_movable" }, { status: 400, code: "invalid" }, { status: 403, code: "forbidden" },
      { status: 503, code: "read_failed" }, { status: 503, code: "NOT_CONFIGURED" }, { status: 503, code: "SELF_URL" },
      { status: 502, code: "REJECTED" }, { status: 502, code: "EDGE_BLOCKED" }, { status: 502, code: "ORIGIN_PROTECTED" }, { status: 502, code: "OLD_BLOC" },
      { status: 502, code: "REDIRECT" }, { status: 502, code: "UPSTREAM_401" },
    ]) {
      expect(failedRunOutcome(r), JSON.stringify(r)).toBeNull();
    }
  });
});

describe("the card after an action (pure transitions)", () => {
  const ok = (r: RunResult) => ({ ok: true, status: 200, j: { result: r } });
  const bad = (status: number, code?: string, error = "שגיאה") => ({ ok: false, status, j: { error, ...(code ? { code } : {}) } });
  const fresh = sb({ counts: { ...counts, legacy: 49, current: 21 } });
  it("dry run ok → pinned to the status read right after it (the previous one if that read failed)", () => {
    const o = afterDryRun(ok(dryResult()), fresh, sb(), T0);
    expect(o.msg).toEqual({ ok: true, text: DRY_RUN_DONE_TEXT });
    expect(o.dry).toEqual(makeDryRun(dryResult(), fresh, T0));
    expect(dryRunState(o.dry, fresh, T0)).toBe("fresh");
    expect(afterDryRun(ok(dryResult()), null, sb(), T0).dry).toEqual(makeDryRun(dryResult(), sb(), T0));
    expect(afterDryRun(ok(dryResult()), null, null, T0).dry).toBeNull();
    expect(o.reload).toBe(false);
  });
  it("dry run failed → no dry run at all; no_current_key reloads the status; an ended session offers sign-in", () => {
    expect(afterDryRun(bad(503, "read_failed"), null, sb(), T0)).toEqual({ dry: null, msg: { ok: false, text: "שגיאה", login: false }, reload: false });
    expect(afterDryRun(bad(409, "no_current_key"), null, sb(), T0).reload).toBe(true);
    expect(afterDryRun(bad(401, "PANEL_SESSION"), null, sb(), T0).msg.login).toBe(true);
    expect(afterDryRun(bad(401, "OTHER"), null, sb(), T0).msg.login).toBe(false);
    expect(afterDryRun(null, null, sb(), T0)).toEqual({ dry: null, msg: { ok: false, text: NET_ERROR_TEXT }, reload: false });
    expect(afterDryRun({ ok: true, status: 200, j: {} }, null, sb(), T0).dry).toBeNull();
  });
  it("re-encrypt ok → the batch shown, the dry run gone (the next batch needs a new one), the window closed, the note cleared, reload", () => {
    const r = { ...dryResult(), dryRun: false };
    expect(afterReencrypt(ok(r), T0)).toEqual({ last: { ...r, at: T0 }, keepDry: false, confirmOpen: false, clearNote: true, noteError: null, msg: null, reload: true });
  });
  it("re-encrypt 400 (the note) → the window stays open with the reason, nothing ran, no reload", () => {
    expect(afterReencrypt(bad(400, undefined, NOTE_SECRET_TEXT), T0)).toEqual({ last: null, keepDry: true, confirmOpen: true, clearNote: false, noteError: NOTE_SECRET_TEXT, msg: null, reload: false });
  });
  it("re-encrypt failed any other way, or no connection → may have run in part: dry run gone, window closed, reload", () => {
    for (const a of [bad(409, "no_current_key"), bad(503, "write_failed"), bad(500, "failed"), bad(504, "TIMEOUT")]) {
      const o = afterReencrypt(a, T0);
      expect(o, JSON.stringify(a)).toEqual({ last: null, keepDry: false, confirmOpen: false, clearNote: false, noteError: null, msg: { ok: false, text: "שגיאה", login: false }, reload: true });
    }
    expect(afterReencrypt(null, T0).msg).toEqual({ ok: false, text: RUN_NET_ERROR_TEXT });
    expect(afterReencrypt(null, T0).keepDry).toBe(false);
    expect(afterReencrypt(bad(401, "PANEL_SESSION"), T0).msg?.login).toBe(true);
  });
});

describe("agoText", () => {
  it("now / a minute / minutes / over an hour", () => {
    expect(agoText(T0, T0 + 30_000)).toBe("עכשיו");
    expect(agoText(T0, T0 + 60_000)).toBe("לפני דקה");
    expect(agoText(T0, T0 + 7 * 60_000)).toBe("לפני 7 דקות");
    expect(agoText(T0, T0 + 61 * 60_000)).toBe("לפני יותר משעה");
  });
});
