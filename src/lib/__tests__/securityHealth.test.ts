import { describe, it, expect } from "vitest";
import { HEALTH_CHECKS, healthSummary } from "../securityHealth";

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
