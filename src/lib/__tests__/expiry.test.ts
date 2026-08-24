import { describe, it, expect } from "vitest";
import {
  toDays,
  resolveExpiresAt,
  effectiveDurationDays,
  UNIT_TO_DAYS,
} from "../expiry";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed clock

describe("toDays", () => {
  it("converts each unit correctly", () => {
    expect(toDays(24, "hours")).toBeCloseTo(1);
    expect(toDays(3, "days")).toBe(3);
    expect(toDays(2, "weeks")).toBe(14);
    expect(toDays(1, "months")).toBe(30);
  });

  it("supports fractional hours (< 1 day)", () => {
    expect(toDays(6, "hours")).toBeCloseTo(0.25);
    expect(toDays(1, "hours")).toBeCloseTo(1 / 24);
  });

  it("treats zero, negative, and non-finite as 0 (permanent)", () => {
    expect(toDays(0, "days")).toBe(0);
    expect(toDays(-5, "days")).toBe(0);
    expect(toDays(NaN, "days")).toBe(0);
    expect(toDays(Infinity, "days")).toBe(0);
  });

  it("UNIT_TO_DAYS covers exactly the four supported units", () => {
    expect(Object.keys(UNIT_TO_DAYS).sort()).toEqual(
      ["days", "hours", "months", "weeks"]
    );
  });
});

describe("resolveExpiresAt", () => {
  it("returns null for permanent (0 / null / undefined)", () => {
    expect(resolveExpiresAt(0, NOW)).toBeNull();
    expect(resolveExpiresAt(null, NOW)).toBeNull();
    expect(resolveExpiresAt(undefined, NOW)).toBeNull();
  });

  it("returns null for negative or non-finite durations", () => {
    expect(resolveExpiresAt(-1, NOW)).toBeNull();
    expect(resolveExpiresAt(NaN, NOW)).toBeNull();
    expect(resolveExpiresAt(Infinity, NOW)).toBeNull();
  });

  it("computes an absolute ISO timestamp for a whole-day duration", () => {
    const iso = resolveExpiresAt(7, NOW);
    expect(iso).toBe(new Date(NOW + 7 * DAY).toISOString());
  });

  it("computes sub-day expiry from fractional days (hours path)", () => {
    const sixHours = toDays(6, "hours");
    const iso = resolveExpiresAt(sixHours, NOW);
    expect(new Date(iso!).getTime() - NOW).toBeCloseTo(6 * HOUR, -2);
  });

  it("is deterministic given an injected clock", () => {
    expect(resolveExpiresAt(1, NOW)).toBe(resolveExpiresAt(1, NOW));
  });
});

describe("effectiveDurationDays", () => {
  it("uses the preset chip when custom is closed", () => {
    expect(effectiveDurationDays({
      customOpen: false, customNum: "99", customUnit: "months", presetDays: 7,
    })).toBe(7);
  });

  it("uses number + unit when custom is open", () => {
    expect(effectiveDurationDays({
      customOpen: true, customNum: "3", customUnit: "weeks", presetDays: 1,
    })).toBe(21);
  });

  it("parses string input and clamps garbage to 0", () => {
    expect(effectiveDurationDays({
      customOpen: true, customNum: "abc", customUnit: "days", presetDays: 30,
    })).toBe(0);
  });

  it("supports the fractional-hours custom case", () => {
    expect(effectiveDurationDays({
      customOpen: true, customNum: "12", customUnit: "hours", presetDays: 0,
    })).toBeCloseTo(0.5);
  });
});
