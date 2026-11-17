// ADS-2א v2 wiring (החלטות 376–383, C5 v2 / C7) — "סטודיו הפרסום", מה שחייב להישאר מחובר:
//   • שום כתיבה ישירה לטבלאות הפרסומות או לבאקט (PANEL-PAY א2ב): כל מה שהסטודיו שומר — postAds → /api/ads → callBloc (C5 v2);
//     מד הקהל (/api/ads/estimate) וההסבר — קריאות בלבד.
//   • המסכים הישנים נמחקו ואף קובץ לא מייבא אותם; הכתובות הישנות מפנות (/ads/campaigns/new → /ads/new; /report → ?tab=performance).
//   • הקריאות לא נשברות לפני SQL 228: "*" ולא רשימת עמודות חדשות.
//   • ה-X בלי ספירה: אין "3", אין טיימר, אין עיגול שקוף; כל תמונה עוברת דרך isOurAdImage; הטקסט על הכפתור — פונקציה אחת (ctaTextColor).
//   • בדיקת משתמש לפי ה-slot שהקמפיין מכסה; כל דף בסטודיו עובר requirePageSession; ES2017 — בלי regex s / d / v, named groups, lookbehind.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { adsFailure } from "@/lib/adsActions";
import { FORMAT_SLOT } from "@/lib/adsFormats";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function files(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && !n.startsWith(".")) files(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.startsWith(".__mt")) out.push(p);
  }
  return out;
}
const ALL = files(SRC).map((f) => ({ f: relative(SRC, f), src: readFileSync(f, "utf8") }));
const STUDIO = readdirSync(join(SRC, "components/ads/studio")).filter((n: string) => /\.tsx?$/.test(n)).map((n: string) => `components/ads/studio/${n}`);
const PAGES = [
  "app/(panel)/ads/page.tsx", "app/(panel)/ads/new/page.tsx", "app/(panel)/ads/campaigns/new/page.tsx", "app/(panel)/ads/campaigns/[id]/page.tsx",
  "app/(panel)/ads/campaigns/[id]/report/page.tsx", "app/(panel)/ads/campaigns/[id]/print/page.tsx", "app/(panel)/ads/advertisers/page.tsx",
  "app/(panel)/ads/advertisers/[id]/page.tsx", "app/(panel)/ads/settings/page.tsx",
];
/** the package's source files (new and changed) */
const PKG = [
  "lib/adsFormats.ts", "lib/ads.ts", "lib/adsActions.ts", "lib/adsUi.ts", "lib/adsExplain.ts", "lib/adsServer.ts", "lib/adsStudio.ts", "lib/validation.ts",
  "app/api/ads/route.ts", "app/api/ads/explain/route.ts", "app/api/ads/report/route.ts", "app/api/ads/estimate/route.ts",
  "components/ads/CreativeImageField.tsx", "components/ads/adsKit.tsx", ...STUDIO, ...PAGES, "app/(panel)/ads/loading.tsx",
];

describe("C5 v2: every write goes through bloc — the panel writes no ad table and no bucket", () => {
  it("no .insert / .update / .upsert / .delete on an ad_* table, no storage write, in any file", () => {
    const WRITE = /\.from\(\s*["']ad_[a-z_]+["']\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/;
    expect(ALL.filter(({ src }) => WRITE.test(src)).map((x) => x.f)).toEqual([]);
    expect(ALL.filter(({ src }) => /\.storage\.from\(/.test(src) && /\.(upload|remove|move|copy|createSignedUploadUrl)\(/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("the studio talks to the server only through postAds / uploadAdImage (writes), /api/ads/estimate and /api/ads/explain (reads)", () => {
    const fetches: string[] = [];
    for (const f of STUDIO) {
      const c = code(f);
      expect(c, f).not.toMatch(/adminClient|@\/lib\/supabase|callBloc|@\/lib\/blocApi/);
      for (const m of c.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)) fetches.push(`${f}: ${m[1]}`);
    }
    expect(fetches.map((x) => x.split(": ")[1]).sort()).toEqual(["/api/ads/estimate", "/api/ads/explain"]);
    expect(read("components/ads/adsKit.tsx")).toContain('fetch("/api/ads", { method: "POST"');
    expect(read("app/api/ads/route.ts")).toContain('callBloc("/api/internal/ads", { actor: actorOf(session), ...b })');
  });
  it("the creative studio sends creative.save per format; the wizard campaign.save (C3, no format); the advertiser form every field", () => {
    // ADS-2ב2 (the independent review): built from the form as it was when "upload" was pressed (the snapshot), still creative.save per format
    expect(code("components/ads/studio/CreativeStudio.tsx")).toContain("const r = await postAds<{ id: string }>(creativePayloadFor(format, snap, campaignId));");
    expect(code("components/ads/studio/CampaignWizard.tsx")).toContain("const r = await postAds<{ id: string }>(campaignPayload(null, formRef.current));");
    expect(code("components/ads/studio/CampaignWizard.tsx")).toContain("send: async (f) => { const r = await postAds(campaignPayload(id, f));");
    expect(code("components/ads/studio/AdvertiserForms.tsx")).toContain("const r = await postAds<{ id: string }>(advertiserPayload(initial?.id ?? null, f));");
    expect(code("lib/adsStudio.ts")).not.toMatch(/format:\s*f\.format|banner_position:\s*f\.banner_position\s*[,}]/);
  });
  it("the estimate route: a read for who builds campaigns — ads.manage (review #4), the RPC only, never callBloc, never the log", () => {
    const r = code("app/api/ads/estimate/route.ts");
    expect(r).toContain('await guard({ permission: "ads.manage" })');
    expect(r).toContain('adminClient.rpc("ad_estimate_reach", {');
    expect(r).not.toMatch(/callBloc|auditLog|\.from\(/);
  });
});

describe("the old screens are gone; the old URLs redirect", () => {
  const OLD = ["AdsCenter", "CampaignEditor", "CreativeManager", "CampaignReport", "AdExplainPanel", "AdsForms", "AdFormatPicker", "FramesEditor", "AdFormatPreview", "AdPhonePreview"];
  it("none of the old components exists, and nothing imports them", () => {
    for (const n of OLD) expect(existsSync(join(SRC, `components/ads/${n}.tsx`)), n).toBe(false);
    const hits = ALL.filter(({ src }) => OLD.some((n) => new RegExp(`from\\s+["'][^"']*/${n}["']`).test(src))).map((x) => x.f);
    expect(hits).toEqual([]);
  });
  it("/ads/campaigns/new → /ads/new; /ads/campaigns/[id]/report → ?tab=performance (the print report moved to /print)", () => {
    expect(code("app/(panel)/ads/campaigns/new/page.tsx")).toContain('redirect("/ads/new");');
    expect(code("app/(panel)/ads/campaigns/[id]/report/page.tsx")).toContain("redirect(`/ads/campaigns/${id}?tab=performance`);");
    expect(code("app/(panel)/ads/campaigns/[id]/print/page.tsx")).toContain('data-ad-print-report=""');
    expect(ALL.filter(({ src }) => /\/ads\/campaigns\/new["'`]/.test(src)).map((x) => x.f)).toEqual([]);   // no link to the old URL is left
    expect(ALL.filter(({ src }) => /campaigns\/\$\{[^}]+\}\/report["'`]/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("every studio page is guarded (requirePageSession, the right permission); the wizard needs ads.manage", () => {
    for (const p of PAGES) expect(code(p), p).toMatch(/await requirePageSession\("ads\.(read|manage)"\)/);
    expect(code("app/(panel)/ads/new/page.tsx")).toContain('await requirePageSession("ads.manage");');
    expect(code("app/(panel)/ads/campaigns/new/page.tsx")).toContain('await requirePageSession("ads.manage");');
  });
  it("server pages never call a function from a \"use client\" module (only components cross the boundary)", () => {
    for (const p of PAGES) {
      for (const m of read(p).matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']@\/components\/ads\/studio\/(\w+)["']/g)) {
        const names = [m[1], ...(m[2] ?? "").split(",").map((x) => x.trim().split(/\s+as\s+/)[0])].filter(Boolean) as string[];
        for (const n of names) expect(n, `${p}: ${n}`).toMatch(/^[A-Z]/);   // components only (a lower-case helper would be a client reference)
      }
    }
  });
});

describe("C7: the reads keep working before SQL 228", () => {
  it("creatives, campaigns, advertisers, contracts are read with \"*\" — never a column list naming the new columns", () => {
    const s = read("lib/adsServer.ts");
    for (const t of ["ad_creatives", "ad_campaigns", "ad_advertisers", "ad_contracts"]) expect(s, t).toMatch(new RegExp(`adminClient\\.from\\("${t}"\\)\\.select\\("\\*"\\)`));
    expect(read("app/api/ads/report/route.ts")).toContain('adminClient.from("ad_creatives").select("*").eq("campaign_id", id)');
    for (const { f, src } of ALL) {
      expect(src, f).not.toMatch(/\.select\(\s*["'][^"']*\b(format|banner_position|theme|frames|accent|focal_x|focal_y|logo_url|brand_color|reach_frozen_at)\b/);
    }
  });
});

describe("decision 377 — the X closes at once; the preview mirrors bloc", () => {
  it("AdPreview: no timer, no countdown, no see-through disc; the solid disc, at the screen's top-left, in every overlay (card / dialog / fullscreen + story)", () => {
    const c = code("components/ads/studio/AdPreview.tsx");
    expect(c).not.toMatch(/setTimeout|setInterval|AD_CLOSE_AFTER_SEC|countdown/);
    // the only state in the preview is the dialog's measured "קרא עוד" (review #11) — no timer can hide behind it
    expect(c.match(/useState\(/g)).toHaveLength(1);
    expect(c).toContain("const [more, setMore] = useState(false);");
    expect(c.match(/useEffect\(/g)).toHaveLength(1);
    expect(c).toContain("useEffect(() => { setMore(isClamped(ref.current)); }, [body, width]);");
    expect(c).not.toContain("rgba(0,0,0,.55)");
    expect(c).toContain('background: "rgba(11,18,32,.92)", border: "1px solid rgba(255,255,255,.25)"');
    expect(c.split("<CloseDisc top={SAFE + 12} left={12} />").length - 1).toBe(3);
  });
  it("the dialog: the dark scrim over the mock screen (no blur), the 16:9 image", () => {
    const c = code("components/ads/studio/AdPreview.tsx");
    expect(c).toContain('background: "rgba(0,0,0,.6)", zIndex: 5');
    expect(c).toContain('aspectRatio: "16 / 9"');
  });
  it("every image passes isOurAdImage (the cover, every frame, the logo); the CTA text from ONE function (ctaTextColor)", () => {
    const c = read("components/ads/studio/AdPreview.tsx");   // raw: the https regex holds a "//"
    expect(c).toContain('const safe = (u: string | null | undefined) => (u && /^https:\\/\\//.test(u) && isOurAdImage(u, p.imageBase ?? null) !== false ? u : null);');
    expect(c).toContain("const logo = safe(p.advertiserLogo ?? null);");
    expect(c).toContain("const frames = (p.frames ?? []).map((f) => ({ ...f, imageUrl: safe(f.imageUrl) }));");
    expect(c).toContain("const ctaStyle: React.CSSProperties = { background: accent, color: ctaTextColor(accent) };");
    expect(code("components/ads/studio/AccentPicker.tsx")).toContain("contrastInfo(");
    const defs = ALL.filter(({ src }) => /function ctaTextColor\(|ctaTextColor\s*=\s*\(/.test(src)).map((x) => x.f);
    expect(defs).toEqual(["lib/adsFormats.ts"]);
  });
  it("the fixed rules: no 3-second X; the X closes at once", () => {
    const s = code("components/ads/studio/StudioSettings.tsx");
    expect(s).not.toContain("3 שניות");
    expect(s).toContain("תמיד אפשר לסגור מיד");
  });
});

describe("explain: per slot the campaign covers (ad_explain p_slot through bloc)", () => {
  it("the mapping: card / dialog / fullscreen / story → full, banner → banner, native / carousel → inline", () => {
    expect(FORMAT_SLOT).toEqual({ card: "full", dialog: "full", fullscreen: "full", story: "full", banner: "banner", native: "inline", carousel: "inline" });
  });
  it("the campaign page asks only in the slots its active ads cover; the panel sends the slot only when it is not full", () => {
    expect(code("components/ads/studio/CampaignStudio.tsx")).toContain("<ExplainBox slots={c.slots} focusCampaign={c.id} />");
    const r = code("app/api/ads/explain/route.ts");
    expect(r).toContain('const extra = slot !== "full" ? { slot } : {};');
    expect(r).toContain('callBloc("/api/internal/ads/explain", { email, screen, ...extra })');
    expect(code("components/ads/studio/ExplainBox.tsx")).toContain("body: JSON.stringify(explainBody(email, screen, slot)),");
  });
});

describe("every bloc code / field path of C5 v2 has a Hebrew sentence", () => {
  it("invalid on every new field / frames.N.*, image_not_ours on frames.N.image_url / logo_url, locked campaign / creative", () => {
    const answers: Array<[string, Record<string, unknown> | undefined]> = [
      ["invalid", { field: "banner_position" }], ["invalid", { field: "frames" }], ["invalid", { field: "frames.0.image_url" }], ["invalid", { field: "frames.1.image_alt" }],
      ["invalid", { field: "frames.2.caption" }], ["invalid", { field: "frames.3.cta_url" }], ["invalid", { field: "frames.4.focal" }], ["invalid", { field: "frames.4" }],
      ["invalid", { field: "format" }], ["invalid", { field: "theme" }], ["invalid", { field: "accent" }], ["invalid", { field: "focal_x" }], ["invalid", { field: "logo_url" }],
      ["invalid", { field: "brand_color" }], ["image_not_ours", { field: "frames.1.image_url" }], ["image_not_ours", { field: "logo_url" }],
      ["locked", { which: "campaign" }], ["locked", { which: "creative" }], ["no_active_creative", undefined],
    ];
    for (const [code, data] of answers) {
      const f = adsFailure({ status: code === "locked" ? 409 : 400, code, error: code, ...(data ? { data } : {}) }, "creative.save");
      expect(f.error, `${code} ${JSON.stringify(data)}`).toMatch(/[א-ת]/);
      expect(f.error, code).not.toContain("undefined");
    }
  });
});

describe("ES2017 (the owner's verify): no regex s / d / v flags, no named groups, no lookbehind in the package's files", () => {
  it("scans every regex literal and RegExp() of the new / changed files (a literal: after an operator / bracket / return, before . , ) ; ])", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of PKG) {
      const src = read(f);
      for (const m of src.matchAll(/\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([a-z]*)/g)) {
        const [all, body, flags] = m;
        const at = m.index ?? 0;
        const before = src.slice(Math.max(0, at - 40), at).replace(/\s+$/, "");
        const after = src.charAt(at + all.length);
        if (!(/[(,=:[!&|?{};]$/.test(before) || /\breturn$/.test(before)) || !/^[.,);\]\s]?$/.test(after)) continue;
        seen++;
        if (/[sdv]/.test(flags)) bad.push(`${f}: flags ${flags} in ${all.slice(0, 40)}`);
        if (/\(\?<[a-zA-Z]/.test(body)) bad.push(`${f}: named group in ${all.slice(0, 40)}`);
        if (/\(\?<[=!]/.test(body)) bad.push(`${f}: lookbehind in ${all.slice(0, 40)}`);
      }
      if (/new RegExp\([^)]*,\s*["'][a-z]*[sdv][a-z]*["']/.test(src)) bad.push(`${f}: RegExp flags`);
    }
    expect(bad).toEqual([]);
    expect(seen).toBeGreaterThan(20);   // the scan does see the package's regexes
  });
});

describe("imports: only what the panel's package.json has; the browser never gets the server side", () => {
  it("the new files import nothing new (no happy-dom, no testing-library)", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const bad: string[] = [];
    for (const f of PKG) {
      for (const m of read(f).matchAll(/(?:^|\n)\s*import[^"']*["']([^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) continue;
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!deps.has(name)) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("browser files import neither the server mapping nor the service client (a type-only import is erased)", () => {
    const client = PKG.filter((x) => /^["']use client["']/.test(read(x)));
    expect(client.length).toBeGreaterThan(12);
    for (const f of client) {
      expect(read(f), f).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(adsActions|adsUpload|adsServer|blocApi|supabase)["']/m);
    }
  });
});

describe("phone first: nothing in the studio is wider than a 320px phone (16px gutters → 288px)", () => {
  it("every grid column minimum of 200px or more is capped at the container — minmax(min(Npx,100%),1fr)", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of STUDIO) {
      for (const m of code(f).matchAll(/minmax\((min\()?(\d+)px/g)) {
        seen++;
        if (Number(m[2]) >= 200 && !m[1]) bad.push(`${f}: minmax(${m[2]}px…)`);
      }
    }
    expect(bad).toEqual([]);
    expect(seen).toBeGreaterThan(8);   // the scan does see the studio's grids
  });
});

describe("the review's alignments (ADS-2א review #4, #11)", () => {
  it("the estimate is ads.manage: the campaign page asks only for a manager, and a read-only viewer sees no gauge (not a false failure)", () => {
    const c = code("components/ads/studio/CampaignStudio.tsx");
    expect(c).toContain("useReach(form, canManage)");
    expect(c).toContain("reach={canManage ? reach : null}");
    expect(code("app/api/ads/estimate/route.ts")).toContain('guard({ permission: "ads.manage" })');
  });
  it("the print report says an upper-bound reach like the screen: \"עד N\" and the why (review #7)", () => {
    const c = code("app/(panel)/ads/campaigns/[id]/print/page.tsx");
    expect(c).toContain('<b data-ad-print-reach="">{reachValueText(r)}</b>');
    expect(c).toContain('{r.reachUpperBound && <p className="note" data-ad-print-upper="">{REACH_UPPER_BOUND_TEXT}</p>}');
  });
  it("the preview mirrors bloc: the dialog's \"קרא עוד\" is measured, never a length rule; the dark card is #0B1220", () => {
    const c = code("components/ads/studio/AdPreview.tsx");
    expect(c).not.toMatch(/body[^;\n]*\.length\s*>/);
    expect(c).toContain("isClamped(ref.current)");
    expect(c).toContain('dark: { bg: "#0B1220"');
  });
});
