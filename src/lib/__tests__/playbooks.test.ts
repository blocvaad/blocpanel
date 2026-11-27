// bloc OPS-1 (שלב 9, החלטה 754): ספרי ההפעלה — כל מפתח שהחיישנים של bloc מפנים אליו מכוסה, ולכל ספר תוכן מלא.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPS_PLAYBOOK_KEYS, PLAYBOOKS, playbook, SEVERITY_LABEL } from "@/lib/playbooks";

// אותה רשימה כמו OPS_PLAYBOOKS ב-bloc (lib/ops/opsStatus) — שינוי שם שם מחייב שינוי כאן.
const BLOC_KEYS = [
  "cron-failed", "cron-stale", "backup-failed", "restore-drill", "queue-moderation", "queue-suppliers", "queue-companies",
  "payments-webhooks", "notice-outbox", "config-missing", "open-incidents",
];

describe("playbooks", () => {
  it("the keys bloc sends are exactly OPS_PLAYBOOK_KEYS, and every one has a playbook", () => {
    expect([...OPS_PLAYBOOK_KEYS]).toEqual(BLOC_KEYS);
    for (const k of BLOC_KEYS) expect([k, !!playbook(k)]).toEqual([k, true]);
  });
  it("keys are unique and well formed (the incident table accepts them)", () => {
    const keys = PLAYBOOKS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9_-]{1,40}$/);
  });
  it("every playbook has a title, when, impact, first steps, steps, a check and who to tell", () => {
    for (const p of PLAYBOOKS) {
      expect([p.key, p.title.length > 3, p.when.length > 10, p.impact.length > 10]).toEqual([p.key, true, true, true]);
      expect([p.key, p.first.length >= 1, p.steps.length >= 1, p.verify.length >= 1, p.notify.length >= 1]).toEqual([p.key, true, true, true, true]);
      expect(SEVERITY_LABEL[p.severity]).toBeTruthy();
      for (const l of p.links) expect(l.href.startsWith("/")).toBe(true);
    }
  });
  it("events without a sensor have playbooks too, and the data exposure one stops the work order and asks for approval", () => {
    for (const k of ["data-exposure", "payment-provider-down", "emergency-alerts", "ai-down", "email-down", "push-down", "db-slow", "account-takeover"]) {
      expect([k, !!playbook(k)]).toEqual([k, true]);
    }
    const p = playbook("data-exposure")!;
    expect(p.severity).toBe("p0");
    expect(p.first.join(" ")).toContain("לעצור את סדר העבודה");
    expect(p.steps.join(" ")).toContain("לאישור");
    expect(playbook("emergency-alerts")!.impact).toContain("חירום לעולם לא מאחורי מנוי");
  });
  it("no secret-looking values in the text", () => {
    const all = JSON.stringify(PLAYBOOKS);
    expect(all).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}|https?:\/\/[a-z0-9]+\.supabase\.co/);
  });
  it("English menu paths read left to right inside the Hebrew (an isolate around them, written as \\u escapes); no literal controls", () => {
    const all = PLAYBOOKS.flatMap((p) => [...p.first, ...p.steps, ...p.verify]);
    const paths = all.filter((t) => /[A-Za-z]+ (→|←) /.test(t));
    expect(paths.length).toBeGreaterThanOrEqual(5);
    for (const t of paths) expect(t).toMatch(/\u2066[^\u2069]*→[^\u2069]*\u2069/);
    expect(paths.some((t) => /[A-Za-z] ← /.test(t))).toBe(false);
    const src = readFileSync(join(process.cwd(), "src/lib/playbooks.ts"), "utf8");
    expect(/[\u2066-\u2069\u202a-\u202e]/.test(src)).toBe(false);
  });
  it("an unknown key — null", () => {
    expect(playbook("nope")).toBeNull();
    expect(playbook(null)).toBeNull();
  });
});
