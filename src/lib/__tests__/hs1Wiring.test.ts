// bloc HOME-STUDIO-1 (החלטות 684–694) — הכללים של חבילת הפאנל, נעוצים:
//   • מי: צפייה (רשימה, מפה, ספירות) — כולם; ניהול — מנהל וסופר-אדמין; התפריט; הדף מעטפת (הנתונים מ-/api, לא בתוך ה-HTML ששומרים).
//   • רק דרך bloc החתום: אין מסד, אין panel-db, אין אחסון; הנתיב הפנימי מגיע רק מ-route, מ-lib השרת ומההעלאה.
//   • ההרשאה נבדקת לפני כל קריאה ל-bloc; כל פעולה שכותבת — שורה ביומן עם תווית בעברית.
//   • בלי HTML גולמי במסך; קישור בתצוגה לא נפתח; טקסטים חדשים בלי מקף ארוך.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct db"); } } }));
vi.mock("@/lib/auth", () => ({ auditLog: vi.fn(async () => {}) }));
import { can, permissionsFor } from "../permissions";
import { NAV_GROUPS, pageTitle } from "../nav";
import { AUDIT_LABELS } from "../auditLabels";
import { HS_ACTIONS, SLOT_LABEL, SHAPE_INFO, SOURCE_INFO, STATUS_LABEL, FREQUENCY_LABEL, ICON_LABEL, STUDIO_ROUTES, HOME_MAP, STUDIO_TEMPLATES, ACCENT_INFO, UPDATE_STATUS_LABEL } from "../homeStudio";
import { loadHomeStudio } from "../homeStudioServer";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const walk = (d: string): string[] => readdirSync(d).flatMap((n: string) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const HS_FILES = [
  "src/lib/homeStudio.ts", "src/lib/homeStudioServer.ts", "src/app/(panel)/home-studio/page.tsx", "src/app/api/home-studio/route.ts", "src/app/api/home-studio/upload/route.ts",
  "src/components/homeStudio/HomeStudioClient.tsx", "src/components/homeStudio/CardEditor.tsx", "src/components/homeStudio/StudioPhone.tsx",
  "src/components/homeStudio/CardStats.tsx", "src/components/homeStudio/UpdatesPanel.tsx", "src/components/homeStudio/hsKit.tsx",
];
const ADMIN = { id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role: "admin" as const };

describe("HOME-STUDIO-1 — who", () => {
  it("everyone reads, admin and super admin manage; the menu entry under communication with its own icon; the page title", () => {
    expect([can("viewer", "home_studio.read"), can("admin", "home_studio.read"), can("superadmin", "home_studio.read")]).toEqual([true, true, true]);
    expect([can("viewer", "home_studio.manage"), can("admin", "home_studio.manage"), can("superadmin", "home_studio.manage")]).toEqual([false, true, true]);
    expect(permissionsFor("viewer").filter((p) => p.startsWith("home_studio"))).toEqual(["home_studio.read"]);
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === "/home-studio"));
    expect(group?.title).toBe("תקשורת");
    expect(group?.items.find((i) => i.href === "/home-studio")).toMatchObject({ label: "מסך הבית", icon: "LayoutTemplate", permission: "home_studio.read" });
    expect(read("src/components/layout/Sidebar.tsx")).toMatch(/\bLayoutTemplate,/);
    expect(pageTitle("/home-studio")).toBe("מסך הבית");
  });
  it("the page: home_studio.read, manage passed down; a shell — the data never inside the page (the service worker keeps pages)", () => {
    const page = read("src/app/(panel)/home-studio/page.tsx");
    expect(page).toContain('requirePageSession("home_studio.read")');
    expect(page).toContain('can(session.role, "home_studio.manage")');
    expect(page).not.toMatch(/loadHomeStudio|callBloc/);
    expect(read("src/components/homeStudio/HomeStudioClient.tsx")).toContain('fetch("/api/home-studio", { credentials: "include", cache: "no-store" })');
  });
  it("the routes: the permission before anything reaches bloc; writes need manage; the upload — manage", () => {
    const r = code("src/app/api/home-studio/route.ts");
    expect(r.indexOf('guard({ permission: "home_studio.read" })')).toBeLessThan(r.indexOf("loadHomeStudio(g.session)"));
    const post = r.slice(r.indexOf("export async function POST"));
    expect(post.indexOf("if (!can(session.role, spec.permission))")).toBeGreaterThan(-1);
    expect(post.indexOf("if (!can(session.role, spec.permission))")).toBeLessThan(post.indexOf("callBloc("));
    expect(Object.entries(HS_ACTIONS).filter(([, v]) => v.permission === "home_studio.manage").map(([k]) => k).sort())
      .toEqual(["card.duplicate", "card.save", "card.status", "switch", "update.save", "update.status"]);
    const u = code("src/app/api/home-studio/upload/route.ts");
    expect(u.indexOf('guard({ permission: "home_studio.manage" })')).toBeLessThan(u.indexOf("callBloc("));
    expect(u).toContain('target.path.startsWith("studio/")');
    for (const f of ["src/app/api/home-studio/route.ts", "src/app/api/home-studio/upload/route.ts"]) expect(read(f), f).toContain('"Cache-Control": "no-store"');
  });
});

describe("HOME-STUDIO-1 — only through the signed bloc", () => {
  it("no database, no panel-db, no storage client in any studio file", () => {
    for (const f of HS_FILES) expect([f, /adminClient|@\/lib\/supabase|panelDb|panel-db|createClient\(/.test(read(f))]).toEqual([f, false]);
  });
  it("the internal path is reached only by the route, the server lib, the upload (and the allowed list of callBloc)", () => {
    const reach = walk(join(ROOT, "src")).filter((f) => readFileSync(f, "utf8").includes('"/api/internal/home-studio"')).map((f) => f.slice(ROOT.length + 1)).sort();
    expect(reach).toEqual(["src/app/api/home-studio/route.ts", "src/app/api/home-studio/upload/route.ts", "src/lib/blocApi.ts", "src/lib/homeStudioServer.ts"]);
  });
  it("the list read: the actor and action list; a bloc failure → said, never an empty list", async () => {
    const calls: any[] = [];
    const call = (async (path: string, payload: any) => { calls.push({ path, payload }); return { ok: false, status: 503, code: "read_failed", error: "x" }; }) as never;
    expect(await loadHomeStudio(ADMIN as never, call)).toEqual({ state: "error", message: "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע." });
    expect(calls).toEqual([{ path: "/api/internal/home-studio", payload: { actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" }, action: "list" } }]);
  });
});

describe("HOME-STUDIO-1 — the log and the copy", () => {
  it("every audit name the studio writes has a Hebrew label", () => {
    const names = [...Object.values(HS_ACTIONS).map((a) => a.audit).filter((a): a is string => !!a), "HOME_STUDIO_IMAGE"];
    for (const n of names) expect([n, /[֐-׿]/.test(AUDIT_LABELS[n]?.label ?? "")]).toEqual([n, true]);
  });
  it("no raw HTML; the phone never opens a link (it is a preview); an external link is not even an <a>", () => {
    for (const f of HS_FILES.filter((x) => x.endsWith(".tsx"))) expect([f, /dangerouslySetInnerHTML|innerHTML\s*=/.test(read(f))]).toEqual([f, false]);
    expect(code("src/components/homeStudio/StudioPhone.tsx")).not.toMatch(/<a\b|href=/);
  });
  it("a duplicate that may have happened locks \"שכפול\" until the list reloads; the item buttons are 44px (review #21, #22)", () => {
    const client = read("src/components/homeStudio/HomeStudioClient.tsx");
    expect(client).toMatch(/if \(r\.unclear\) setStale\(true\)/);
    expect(client).toMatch(/busy=\{busy \|\| stale\}/);
    expect(client).toMatch(/if \(next\.phase === "ok"\) setStale\(false\)/);
    expect(read("src/components/homeStudio/CardEditor.tsx")).toMatch(/const iconBtn: React\.CSSProperties = \{ width: "44px", height: "44px"/);
  });
  it("every new label a person sees: Hebrew or a plan name, never a long dash", () => {
    const labels = [
      ...Object.values(SLOT_LABEL), ...HOME_MAP.map((r) => r.row), ...Object.values(SHAPE_INFO).flatMap((s) => [s.label, s.hint]),
      ...Object.values(SOURCE_INFO).flatMap((s) => [s.label, s.hint]), ...Object.values(STATUS_LABEL), ...Object.values(FREQUENCY_LABEL),
      ...Object.values(ICON_LABEL), ...STUDIO_ROUTES.map((r) => r.label), ...STUDIO_TEMPLATES.flatMap((t) => [t.label, t.hint]),
      ...Object.values(ACCENT_INFO).map((a) => a.label), ...Object.values(UPDATE_STATUS_LABEL),
    ];
    for (const l of labels) expect([l, /[—–]/.test(l)]).toEqual([l, false]);
  });
});
