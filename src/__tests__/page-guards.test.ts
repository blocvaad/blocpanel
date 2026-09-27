// סריקה סטטית: כל דף שרת בפאנל שקורא ל-DB עם service_role חייב לעבור
// requirePageSession (MFA מלא + סשן חי + הרשאה). ה-middleware בודק רק שיש
// cookie; בלי זה דף יכול להיטען עם סשן pre-MFA או מבוטל.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") walk(p, out); }
    else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const rel = (p: string) => p.slice(ROOT.length + 1);
const isClient = (s: string) => /^\s*["']use client["']/.test(s);

describe("panel page guards", () => {
  const pages = files.filter((f) => f.includes("/app/(panel)/") && /\/(page|layout)\.tsx$/.test(f));

  it("finds the panel pages", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it("every server page/layout that uses adminClient calls requirePageSession", () => {
    const bad = pages.filter((f) => {
      const s = readFileSync(f, "utf8");
      return !isClient(s) && s.includes("adminClient") && !s.includes("requirePageSession(");
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it("the (panel) layout itself is guarded", () => {
    const layout = pages.find((f) => f.endsWith("(panel)/layout.tsx"))!;
    expect(readFileSync(layout, "utf8")).toContain("requirePageSession(");
  });

  it("no client component imports the service-role client", () => {
    const bad = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return isClient(s) && /from\s+["']@\/lib\/supabase["']/.test(s);
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it("the browser never builds a Supabase client (anon realtime was blocked by RLS)", () => {
    const bad = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return isClient(s) && (s.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") || s.includes("@supabase/supabase-js"));
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it("product notifications are written with receiver_id (no user_id column)", () => {
    const bad = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /from\(["']notifications["']\)\s*\.insert\(\s*\{[^}]*\buser_id\s*:/.test(s);
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it("no public webhook relay route", () => {
    expect(files.some((f) => f.includes("/app/api/webhook/"))).toBe(false);
  });
});
