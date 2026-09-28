// מייל קוד הכניסה לפאנל — אותה מעטפת ממותגת של bloc, קוד גדול, תוקף נכון.
import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({ Resend: class { emails = { send: async () => ({ error: null }) }; } }));

import { twoFactorEmail } from "@/lib/email";
import { esc } from "@/lib/emailLayout";

describe("twoFactorEmail", () => {
  const m = twoFactorEmail("482913", new Date("2026-09-28T09:00:00Z"));
  it("the bloc branded layout: RTL, blue header, the original logo", () => {
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain("#1D4ED8");
    expect(m.html).toContain("https://www.blocvaad.co.il/brand/bloc-logo-white.png");
    expect(m.html).not.toContain("#09090b");          // the old dark card is gone
  });
  it("the code, its 10-minute validity, Israel time, and a 'not you?' warning", () => {
    expect(m.html).toContain("482913");
    expect(m.html).toContain("10 דקות");
    expect(m.html).toContain("12:00");               // 09:00Z = 12:00 IDT
    expect(m.html).toContain("לא ניסיתם להיכנס?");
    expect(m.subject).toBe("קוד אימות blocpanel: 482913");
    expect(m.text).toContain("482913");
  });
  it("escapes", () => {
    expect(esc('<a href="x">')).toBe("&lt;a href=&quot;x&quot;&gt;");
  });
});
