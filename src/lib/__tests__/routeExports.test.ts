// BILL-1a fix: a route file exports only what Next.js accepts (the methods and the segment config). A helper exported from a
// route — even a constant — fails `next build` ("… is not a valid Route export field"), which only the owner's verify caught.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(process.cwd(), "src", "app");
function routes(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") routes(p, out); }
    else if (n === "route.ts" || n === "route.tsx") out.push(p);
  }
  return out;
}

const ALLOWED = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration", "generateStaticParams",
]);

describe("route files export only what Next.js accepts", () => {
  const files = routes(APP);
  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(join("api", "billing", "tasks", "route.ts")))).toBe(true);
  });
  it("no other value export (types are fine)", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        if (!ALLOWED.has(m[1])) bad.push(`${relative(APP, f)}: ${m[1]}`);
      }
      for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim() ?? "";
          if (name && !name.startsWith("type ") && !ALLOWED.has(name)) bad.push(`${relative(APP, f)}: ${name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
