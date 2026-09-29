import { describe, it, expect } from "vitest";
import { HEALTH_CHECKS, healthSummary, blocHealthRows } from "../securityHealth";

describe("securityHealth", () => {
  it("known P2 does not count as a failure", () => {
    const s = healthSummary([
      { check_key: "secrets_table_locked", ok: true, detail: null },
      { check_key: "buildings_select_scoped", ok: false, detail: "USING(true)" },
      { check_key: "rls_enabled", ok: false, detail: "x" },
    ]);
    expect(s).toEqual({ ok: 1, failed: 1, knownOpen: 1 });
  });
  it("unknown keys count as failures (never silently green)", () => {
    expect(healthSummary([{ check_key: "new_check", ok: false, detail: null }]).failed).toBe(1);
  });
  it("every check has a Hebrew title and a fix", () => {
    for (const [k, v] of Object.entries(HEALTH_CHECKS)) {
      expect(v.title, k).toBeTruthy();
      expect(v.fix, k).toBeTruthy();
    }
  });
});

describe("blocHealthRows (143 — /api/internal/health)", () => {
  it("keeps only well-formed bloc_ rows, no values beyond a short detail", () => {
    const rows = blocHealthRows({
      checks: [
        { check_key: "bloc_push", ok: true, detail: null },
        { check_key: "bloc_email", ok: false, detail: "x".repeat(500) },
        { check_key: "rls_enabled", ok: true, detail: null },       // not bloc_ → dropped (can't spoof DB rows)
        { check_key: "bloc_ai", ok: "yes", detail: null },           // bad shape → dropped
        null,
      ],
    });
    expect(rows.map((r) => r.check_key)).toEqual(["bloc_push", "bloc_email"]);
    expect(rows[1].detail?.length).toBe(200);
  });
  it("garbage → no rows", () => {
    expect(blocHealthRows(null)).toEqual([]);
    expect(blocHealthRows({ checks: "no" })).toEqual([]);
  });
  it("optional bloc capabilities count as known, not failed", () => {
    const s = healthSummary([
      { check_key: "bloc_ai", ok: false, detail: null },
      { check_key: "bloc_whatsapp", ok: false, detail: null },
      { check_key: "bloc_push", ok: false, detail: null },
    ]);
    expect(s).toEqual({ ok: 0, failed: 1, knownOpen: 2 });
  });
  it("every bloc key the server can send has a title (same list as bloc/src/lib/configHealth.ts)", () => {
    for (const k of [
      "bloc_reachable", "bloc_payplus_configured", "bloc_payplus_live", "bloc_webhook_token_secret",
      "bloc_insecure_webhooks_off", "bloc_credentials_encryption", "bloc_cron_secret", "bloc_admin_2fa_secret",
      "bloc_rate_limit", "bloc_push", "bloc_email", "bloc_queue", "bloc_whatsapp", "bloc_ai", "bloc_backup",
    ]) expect(HEALTH_CHECKS[k]?.title, k).toBeTruthy();
  });
});
