// א3-1 (תיקון אחרי ה-verify של הבעלים, 18/11): קובץ page / layout / route ב-Next מייצא רק את מה ש-Next מכיר.
// ייצוא אחר (למשל טקסט קבוע מתוך page.tsx) עובר את tsc ואת הטסטים, ונופל רק ב-build: "X is not a valid Page export field".
// הטקסטים של המסכים — בקובץ ב-lib (כמו lib/dashboardTexts), לא בקובץ של הדף.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PAGE_FIELDS = new Set([
  "default", "config", "generateStaticParams", "revalidate", "dynamic", "dynamicParams", "fetchCache", "preferredRegion", "runtime",
  "maxDuration", "metadata", "generateMetadata", "viewport", "generateViewport", "experimental_ppr", "unstable_prefetch",
]);
const ROUTE_FIELDS = new Set([
  "GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH",
  "revalidate", "dynamic", "dynamicParams", "fetchCache", "preferredRegion", "runtime", "maxDuration", "generateStaticParams",
]);
const SPECIAL = /^(page|layout|route|loading|error|not-found|template|default|global-error)\.(tsx|ts|jsx|js)$/;

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${n}`;
    if (statSync(join(ROOT, p)).isDirectory()) files(p, out);
    else if (SPECIAL.test(n)) out.push(p);
  }
  return out;
}

/** השמות שהקובץ מייצא כערך (לא type / interface). */
export function exportedValues(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p || p.startsWith("type ")) continue;
      names.add(p.split(/\s+as\s+/).pop()!.trim());
    }
  }
  if (/^export\s+default\b/m.test(src)) names.add("default");
  return [...names];
}

describe("Next special files export only what Next allows", () => {
  it("the parser: values yes, types no", () => {
    expect(exportedValues('export const dynamic = "force-dynamic";\nexport type X = 1;\nexport interface Y {}\nexport default function P() {}').sort())
      .toEqual(["default", "dynamic"]);
    expect(exportedValues("export async function GET() {}\nexport { a as POST, type T }").sort()).toEqual(["GET", "POST"]);
  });
  it("every page / layout / route / loading / error file under src/app", () => {
    const list = files("src/app");
    expect(list.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const f of list) {
      const kind = f.split("/").pop()!.split(".")[0];
      const ok = kind === "route" ? ROUTE_FIELDS : kind === "page" || kind === "layout" ? PAGE_FIELDS : new Set(["default"]);
      for (const n of exportedValues(readFileSync(join(ROOT, f), "utf8"))) if (!ok.has(n)) bad.push(`${f}: ${n}`);
    }
    expect(bad).toEqual([]);
  });
});
