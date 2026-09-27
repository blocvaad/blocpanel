import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS, pageTitle } from "../nav";
import { can } from "../permissions";

const PAGES = join(process.cwd(), "src/app/(panel)");

describe("nav — grouped sidebar", () => {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  it("every item points at a real page", () => {
    for (const it of items) expect(existsSync(join(PAGES, it.href.slice(1), "page.tsx")), it.href).toBe(true);
  });
  it("no duplicate hrefs", () => {
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
  });
  it("money pages require payments.read", () => {
    for (const h of ["/money", "/payments", "/debt"]) expect(items.find((i) => i.href === h)?.permission).toBe("payments.read");
    expect(items.find((i) => i.href === "/billing")?.superadminOnly).toBe(true);
  });
  it("pageTitle uses the longest matching prefix", () => {
    expect(pageTitle("/buildings/123/report")).toBe("בניינים");
    expect(pageTitle("/management-companies")).toBe("חברות ניהול");
    expect(pageTitle("/nope")).toBe("פאנל");
  });
});

describe("permissions — page redirects", () => {
  it("every role can open /overview (the target of a denied-page redirect — no loop)", () => {
    for (const r of ["viewer", "admin", "superadmin"] as const) expect(can(r, "buildings.read"), r).toBe(true);
  });
});

describe("permissions — supplier verification", () => {
  it("admin + superadmin may verify suppliers; viewer may not", () => {
    expect(can("superadmin", "suppliers.verify")).toBe(true);
    expect(can("admin", "suppliers.verify")).toBe(true);
    expect(can("viewer", "suppliers.verify")).toBe(false);
  });
});
