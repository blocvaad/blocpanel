// bloc COMPANY-1 (D5, החלטות 650, 654) — החיווט בפאנל: הבקשות במסך החברות, המונה בתפריט, הפעמון, ההתראות מ-bloc, היומן.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AUDIT_LABELS } from "../auditLabels";

const code = (p: string) => readFileSync(p, "utf8");

describe("COMPANY-1 in the panel", () => {
  it("the requests sit on the companies screen; the decision goes only to bloc's signed route", () => {
    expect(code("src/app/(panel)/management-companies/page.tsx")).toContain("<LinkRequestsPanel />");
    const r = code("src/app/api/management-companies/links/route.ts");
    expect(r).toContain('const g = await guard({ permission: "management.approve" });');
    expect(r).toContain('await callBloc("/api/internal/management-links", {');
    expect(r).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(code("src/lib/blocApi.ts")).toContain('| "/api/internal/management-links"');
  });
  it("the menu badge loads on every screen change; the dashboard takes its counts from bloc (no direct read)", () => {
    const sb = code("src/components/layout/Sidebar.tsx");
    expect(sb).toContain('fetch("/api/nav-counts", { credentials: "include" })');
    expect(sb).toContain("}, [pathname]);");
    const ov = code("src/app/(panel)/overview/page.tsx");
    expect(ov).toContain("const companiesPending = d?.counts.companiesPending ?? null;");
    expect(ov).toContain("const linkRequests = d?.counts.linkRequests ?? null;");
    expect(ov).not.toContain('from("management_companies")');
    expect(ov).not.toContain('from("management_link_requests")');
  });
  it("every new log action has a label", () => {
    for (const a of ["MANAGEMENT_LINK_APPROVE", "MANAGEMENT_LINK_DECLINE", "MANAGEMENT_LINK_UNKNOWN"]) expect(AUDIT_LABELS[a]?.label, a).toBeTruthy();
  });
});
