// MOD-1 (bloc MG-S1179, MG-S1211, MG-S1177; החלטות 584–587) — הכללים של חבילת הפאנל, נעוצים:
//   • הדיווחים על הודעות פרטיות — מנהל וסופר-אדמין בלבד (viewer לא רואה גם את הרשימה); רק דרך bloc החתום (אין קריאה למסד);
//     הקישורים לדיווח — בלי prefetch (פתיחה נרשמת, רק לחיצה פותחת); הפעמון מקשר לדיווח.
//   • הלוגו: של הפאנל — בתוך הפאנל (התפריט, הכניסה, הלשונית); של bloc — במה שמייצג את החברה (תצוגת ההודעה לדיירים, הדוחות להדפסה).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { can, permissionsFor } from "../permissions";
import { NAV_GROUPS } from "../nav";
import { notificationLink } from "../committee";
import { AUDIT_LABELS } from "../auditLabels";
import { WITHOUT_DM_ROWS } from "../dmReports";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((n: string) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const DM_FILES = [
  "src/lib/dmReports.ts", "src/lib/dmReportsServer.ts", "src/lib/dmMediaClient.ts", "src/components/dmReports/DmReportsQueue.tsx", "src/components/dmReports/DmReportView.tsx",
  "src/components/dmReports/kit.tsx", "src/app/(panel)/dm-reports/page.tsx", "src/app/(panel)/dm-reports/[id]/page.tsx", "src/app/api/dm-reports/route.ts", "src/app/api/dm-reports/media/route.ts",
];

describe("MOD-1 — private-message reports in the panel", () => {
  it("admin and super admin only; a viewer gets neither the list nor the actions; the menu entry carries the permission", () => {
    for (const p of ["dm_reports.read", "dm_reports.manage"] as const) {
      expect([can("viewer", p), can("admin", p), can("superadmin", p)]).toEqual([false, true, true]);
    }
    expect(permissionsFor("viewer").filter((p) => p.startsWith("dm_reports"))).toEqual([]);
    expect(NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/dm-reports")).toMatchObject({ permission: "dm_reports.read", icon: "MessageCircle" });
    // in the icon map itself (bloc HOME-STUDIO-1 added an icon after it — the map, not the last line, is what matters)
    const sidebar = read("src/components/layout/Sidebar.tsx");
    const icons = sidebar.slice(sidebar.indexOf("const ICONS"), sidebar.indexOf("};", sidebar.indexOf("const ICONS")));
    expect(icons).toMatch(/\bMessageCircle,/);
  });

  it("the pages and routes check the permission first; everything goes through the signed bloc route — no database client in any DM file", () => {
    expect(read("src/app/(panel)/dm-reports/page.tsx")).toContain('await requirePageSession("dm_reports.read")');
    expect(read("src/app/(panel)/dm-reports/[id]/page.tsx")).toContain('await requirePageSession("dm_reports.read")');
    expect(read("src/app/(panel)/dm-reports/[id]/page.tsx")).toContain('canManage={can(session.role, "dm_reports.manage")}');
    expect(read("src/app/api/dm-reports/route.ts")).toContain('guard({ permission: "dm_reports.manage" })');
    expect(read("src/app/api/dm-reports/media/route.ts")).toContain('guard({ permission: "dm_reports.read" })');
    for (const f of DM_FILES) expect(read(f), f).not.toMatch(/adminClient|@\/lib\/supabase/);
    expect(read("src/lib/blocApi.ts")).toContain('| "/api/internal/dm-reports"');
    expect(read("src/lib/dmReportsServer.ts")).toContain('call: Call = callBloc): Promise<DmQueueData> {\n  const r = await call("/api/internal/dm-reports"');
    expect(read("src/lib/dmReportsServer.ts")).toContain('(o.call ?? callBloc)("/api/internal/dm-reports"');
  });

  it("every link to one report opens only on a click (no prefetch — an open is logged); the bell links to the report", () => {
    const linkTo = /<Link\s[^>]*href=\{`\/dm-reports\/\$\{[^`]*`\}[^>]*>/g;
    const links = walk(join(ROOT, "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(linkTo)].map((m) => m[0]));
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toContain("prefetch={false}");
    expect(notificationLink({ type: "dm_report", entity_type: "dm_report", entity_id: "77777777-7777-4777-8777-777777777771" })).toBe("/dm-reports/77777777-7777-4777-8777-777777777771");
    for (const a of ["DM_REPORT_VIEW", "DM_REPORT_MEDIA", "DM_REPORT_REVIEW", "DM_REPORT_REOPEN"]) expect(AUDIT_LABELS[a]?.label, a).toBeTruthy();
  });

  it("review #2: the pages are shells — report content and the queue come from /api (and since 589 the service worker keeps no copy at all)", () => {
    for (const f of ["src/app/(panel)/dm-reports/page.tsx", "src/app/(panel)/dm-reports/[id]/page.tsx"]) {
      expect(read(f), f).not.toMatch(/loadDmReports?\b|callBloc|dmReportsServer/);
    }
    expect(read("public/sw.js")).not.toMatch(/caches\.open|\.put\(/);
    expect(read("src/components/dmReports/DmReportView.tsx")).toContain('fetch("/api/dm-reports/one", { method: "POST"');
    expect(read("src/components/dmReports/DmReportsQueueClient.tsx")).toContain("return `/api/dm-reports?${q.toString()}`;");
    expect(read("src/app/api/dm-reports/one/route.ts")).toContain('guard({ permission: "dm_reports.read" })');
    expect(read("src/app/api/dm-reports/route.ts")).toContain('export async function GET(req: NextRequest) {\n  const g = await guard({ permission: "dm_reports.read" });');
  });

  it("review #1 and #7: the bell, the log and the overview hide report rows from a role without dm_reports.read", () => {
    expect(WITHOUT_DM_ROWS).toBe("entity_type.is.null,entity_type.neq.dm_report");
    // bloc SAFETY-1: the bell, the log and the overview — one filter for both kinds of report rows (dm_report, content_report)
    for (const f of ["src/app/(panel)/logs/page.tsx", "src/app/(panel)/overview/page.tsx"]) {
      const c = read(f);
      expect(c, f).toContain('reportRowsFilter(can(session.role, "dm_reports.read"), can(session.role, "content_reports.read"))');
    }
    for (const f of ["src/app/api/notifications/route.ts", "src/app/api/notifications/read-all/route.ts"]) {
      const c = read(f);
      expect(c, f).toContain('reportRowsFilter(can(g.session.role, "dm_reports.read"), can(g.session.role, "content_reports.read"))');
      expect(c, f).toContain("if (hidden) q = q.or(hidden);");
    }
    expect(read("src/components/layout/TopBar.tsx")).toContain("ההתראות לא נטענו. נסו שוב בעוד רגע.");
  });

  it("a reported file opens in the browser only: POST (logged), the AAD of bloc, a safe type; the blob is released", () => {
    const c = read("src/lib/dmMediaClient.ts");
    expect(c).toContain("`bloc-dm-file-v1|${mediaId}`");
    expect(c).toContain('method: "POST"');
    expect(c).toContain('credentials: "omit"');
    expect(c).toContain("new Blob([plain], { type: mime })");
    const v = read("src/components/dmReports/DmReportView.tsx");
    expect(v).toContain("for (const u of urls.current) URL.revokeObjectURL(u);");
    expect(v).toContain("if (cur?.state === \"open\") URL.revokeObjectURL(cur.url)");
    // a download that finishes after leaving the page is released at once, and running downloads are stopped (review #14)
    expect(v).toContain("if (!mounted.current) { if (r.ok) URL.revokeObjectURL(r.url); return }");
    expect(v).toContain("for (const c of aborts.current) c.abort();");
  });
});

describe("MOD-1 — the logos (MG-S1177)", () => {
  it("the panel logo inside the panel: the menu, the sign-in and the tab", () => {
    expect(read("src/components/layout/Sidebar.tsx")).toContain('src="/panel-logo.svg"');
    expect(read("src/app/login/page.tsx")).toContain('src="/panel-logo.svg"');
    expect(read("src/app/layout.tsx")).toContain('{ url: "/panel-logo.svg", type: "image/svg+xml" }');
    expect(read("public/panel-logo.svg")).toContain("<title id=\"bp-title\">bloc panel</title>");
    expect(read("src/components/layout/Sidebar.tsx")).not.toContain(">B</span>");
    // the sign-in screen has no session yet: the logo must pass the middleware like the PWA icons
    expect(read("src/middleware.ts")).toContain('pathname === "/panel-logo.svg" ||');
  });
  it("what represents the company carries the bloc logo, never the panel one: the message preview, the advertiser report, the building report", () => {
    for (const f of ["src/components/ui/BroadcastForm.tsx", "src/app/(panel)/ads/campaigns/[id]/print/page.tsx", "src/app/(panel)/buildings/[id]/report/page.tsx"]) {
      const s = read(f);
      expect(s, f).toMatch(/src="\/brand\/bloc-(icon|wordmark-blue)\.svg"/);
      expect(s, f).not.toContain("panel-logo");
    }
    expect(read("src/app/(panel)/buildings/[id]/report/page.tsx")).toContain("<span>bloc · ניהול בניינים</span>");
    expect(read("src/app/(panel)/buildings/[id]/report/page.tsx")).not.toContain("blocpanel — ניהול בניינים");
    expect(read("public/brand/bloc-wordmark-blue.svg")).toContain('stop-color="#2B2BD7"');
    expect(read("public/brand/bloc-icon.svg")).toContain('viewBox="0 0 512 512"');
  });
});
