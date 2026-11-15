// PANEL-PAY א2ב wiring (החלטות 371–373, 375): הכתיבות של הפרסומות לא נעשות יותר מהפאנל — רק דרך bloc החתום (/api/internal/ads),
// עם השחקן מהסשן; העלאת תמונה — כתובת חתומה מ-bloc ו-PUT, בלי service role ובלי לקוח supabase; הקריאות (רשימות, בדיקת
// משתמש, דוח) נשארות עד א3. המסכים: הצלחה רק עם ok === true, בלי "שמירה" שנייה אחרי תשובה לא ברורה ליצירה, תמונה רק דרך
// ההעלאה; דף הבניין — "סליקת דיירים" בלי מזהה גולמי.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AUDIT_LABELS } from "@/lib/auditLabels";
import { AD_ACTIONS } from "@/lib/adsActions";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
function files(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && !n.startsWith(".")) files(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.startsWith(".__mt")) out.push(p);
  }
  return out;
}
const ALL = files(SRC).map((f) => ({ f: relative(SRC, f), src: readFileSync(f, "utf8") }));
/** every statement (up to the next ';') that starts at the needle */
function statementsAt(needle: string): Array<{ f: string; stmt: string }> {
  const out: Array<{ f: string; stmt: string }> = [];
  for (const { f, src } of ALL) {
    let i = 0;
    while ((i = src.indexOf(needle, i)) >= 0) {
      const end = src.indexOf(";", i);
      out.push({ f, stmt: src.slice(i, end < 0 ? undefined : end) });
      i += needle.length;
    }
  }
  return out;
}
const WRITE = /\.(update|insert|upsert|delete)\(/;
const STORAGE_WRITE = /\.(upload|update|remove|move|copy|createSignedUploadUrl|uploadToSignedUrl)\(/;

describe("no direct ads writes remain in src (reads for the lists, explain and the report stay until א3)", () => {
  it("no .insert / .update / .upsert / .delete on any ad_* table", () => {
    const ad = statementsAt('.from("ad_');
    expect(ad.filter((s) => WRITE.test(s.stmt)).map((s) => `${s.f}: ${s.stmt.slice(0, 60)}`)).toEqual([]);
    expect(ad.length).toBeGreaterThan(0);   // the scan sees the reads
    expect(ALL.filter(({ src }) => /\.from\(\s*'ad_/.test(src)).map((x) => x.f)).toEqual([]);   // no other quoting slips past
  });
  it("no storage write anywhere (the ads bucket gets bytes only through bloc's signed URL)", () => {
    expect(statementsAt(".storage.from(").filter((s) => STORAGE_WRITE.test(s.stmt)).map((s) => s.f)).toEqual([]);
    expect(ALL.filter(({ src }) => /storage\.from\(\s*["']ads["']/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("the two ads write routes and the PUT helper never import the service-role client or supabase-js", () => {
    for (const f of ["app/api/ads/route.ts", "app/api/ads/upload/route.ts", "lib/adsUpload.ts", "lib/adsActions.ts", "lib/adsUi.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/from\s+["']@\/lib\/supabase["']|@supabase\/|adminClient|SERVICE_ROLE/);
    }
  });
  it("the PUT sends content-type, cache-control (a year), x-upsert=false, and only bloc's PUBLIC key from C4 (never the service role)", () => {
    const u = read("lib/adsUpload.ts");
    expect(u).toContain('"content-type": type, "cache-control": AD_IMAGE_CACHE, "x-upsert": "false",');
    expect(u).toContain("...(opts.anonKey ? { apikey: opts.anonKey, authorization: `Bearer ${opts.anonKey}` } : {}),");
    expect(u).toContain('export const AD_IMAGE_CACHE = "max-age=31536000";');
    expect(u).not.toMatch(/SERVICE_ROLE|service_role|process\.env/);
    expect(u).toContain('method: "PUT"');
  });
});

describe("the routes: guard → body → bloc, with the session's actor; success only on a clear answer", () => {
  const order = (src: string, marks: string[]) => marks.map((m) => src.indexOf(m));
  it("POST /api/ads: ads.manage → the panel's schema → callBloc('/api/internal/ads', { actor: actorOf(session), …the parsed body })", () => {
    const r = read("app/api/ads/route.ts");
    const [g, p, c, s] = order(r, ['await guard({ permission: "ads.manage" })', "await parseBody(req, adActionSchema)",
      'callBloc("/api/internal/ads", { actor: actorOf(session), ...b })', "const done = adsAnswer(b, r.data);"]);
    expect(g).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(g);
    expect(c).toBeGreaterThan(p);
    expect(s).toBeGreaterThan(c);
    expect(r).toContain("if (!done) {");
    expect(r).not.toMatch(/actor: (body|parsed|req|b\.|raw)/);
    expect(r).toMatch(/^export const maxDuration = 60;$/m);
    expect(r).toContain("const a = adsFailureAudit(r, act.audit);");
    expect(r).toContain("const bad = actionBadShape(act.audit);");
  });
  it("POST /api/ads/upload: ads.manage → the bytes sniffed → bloc's image.upload_url → the shape checked → the PUT → the public URL", () => {
    const r = read("app/api/ads/upload/route.ts");
    const [g, sn, c, t, put] = order(r, ['await guard({ permission: "ads.manage" })', "sniffImage(new Uint8Array(buf))",
      'callBloc("/api/internal/ads", { actor: actorOf(session), action: "image.upload_url", type: kind.type, bytes: buf.byteLength })',
      "const target = uploadTarget(r.data);", "await putSignedImage(target.signed_url, buf, kind.type, { anonKey: target.anon_key })"]);
    expect(g).toBeGreaterThan(-1);
    expect(sn).toBeGreaterThan(g);
    expect(c).toBeGreaterThan(sn);
    expect(t).toBeGreaterThan(c);
    expect(put).toBeGreaterThan(t);
    expect(r).toContain("return NextResponse.json({ ok: true, url: target.public_url }");
    expect(r).toContain("return bad(UPLOAD_FAILED_TEXT, 502, put.code);");
    expect(r).not.toMatch(/console\.\w+\([^)]*signed_url/);   // the URL carries a token — never logged
    expect(r).toMatch(/^export const maxDuration = 60;$/m);
  });
  it("callBloc knows the path; every ads action the panel logs has a Hebrew label", () => {
    expect(read("lib/blocApi.ts")).toContain('| "/api/internal/ads"');
    for (const k of [...Object.values(AD_ACTIONS).map((a) => a.audit), "AD_IMAGE_UPLOAD", "BLOC_ACTION_FAILED", "BLOC_ACTION_UNKNOWN"]) {
      expect(AUDIT_LABELS[k]?.label, k).toMatch(/[א-ת]/);
    }
  });
});

describe("the screens", () => {
  it("postAds / uploadAdImage read the answer through lib/adsUi (success only with ok === true; unclear marked)", () => {
    const k = read("components/ads/adsKit.tsx");
    expect(k).toContain("return readAdsAnswer<T>(r, j);");
    expect(k).toContain("return connectionFailure();");
    expect(k).toContain("return readUploadAnswer(r, j);");
    expect(k).not.toMatch(/return \{ ok: true, data: j/);
  });
  it("the creative editor: no free image-address input; the image box; image_not_ours at the box; no second create after an unclear answer", () => {
    const m = read("components/ads/CreativeManager.tsx");
    expect(m).not.toContain('data-creative-field="image_url"');
    expect(m).not.toContain("או כתובת של תמונה");
    expect(m).toContain('<CreativeImageField url={foreign(draft.image_url) ? "" : draft.image_url} box={box} locked={contentLocked} onPick={onPick} />');   // review #11: an outside image is not loaded
    expect(m).toContain('if (r.code === "image_not_ours") { setRefusal(r.error); return; }');
    expect(m).toContain("if (lockedAfter(r, !draft.id)) setStale(true);");
    expect(m).toContain("const canSave = ready && !busy && !uploading && !stale;");
  });
  it("the campaign editor: no second create / duplicate after an unclear answer; the duplicate lands with the creatives' fate", () => {
    const e = read("components/ads/CampaignEditor.tsx");
    expect(e).toContain('if (!r.ok) { setErr(r.error); if (lockedAfter(r, !campaign)) setStale("save"); return; }');
    expect(e).toContain('if (!r.ok) { setErr(r.error); if (lockedAfter(r, true)) setStale("dup"); return; }');
    expect(e).toContain("router.push(duplicateHref(r.data.id, r.data.creatives, r.data.skipped_outside));");   // review #6
    expect(e).toContain('disabled={!!busy || stale === "dup"}');
    expect(e).toContain('disabled={!!busy || stale === "save" ||');
    const page = read("app/(panel)/ads/campaigns/[id]/page.tsx");
    expect(page).toContain("const arrival = campaignArrival(await searchParams);");
    expect(page).toContain("{arrival && <Banner tone={arrival.tone}><span data-campaign-arrival={arrival.tone}>{arrival.text}</span></Banner>}");
  });
  it("the advertiser / contract windows: no second create after an unclear answer; \"close and refresh\" instead", () => {
    const f = read("components/ads/AdsForms.tsx");
    expect(f.split("if (lockedAfter(r, !initial)) setStale(true);").length - 1).toBe(2);
    expect(f).toContain("onSaved(RECHECK_TEXT.advertiser)");
    expect(f).toContain("onSaved(RECHECK_TEXT.contract)");
    expect(f.split("disabled={busy || stale ||").length - 1).toBe(2);
  });
  it("the building page: the facts card, never a raw provider id", () => {
    const p = read("app/(panel)/buildings/[id]/page.tsx");
    expect(p).toContain("<BillingFactsCard billing={billing} payer={ent?.payer ?? null} />");
    expect(ALL.filter(({ src }) => /מחוברת · \$\{[^}]*payment_provider/.test(src)).map((x) => x.f)).toEqual([]);
    expect(read("components/ui/BillingFactsCard.tsx")).toContain("tenantCollectionText(billing.payment_provider, billing.has_gateway)");
  });
  it("browser files import neither the server mapping nor the PUT helper", () => {
    for (const { f, src } of ALL.filter(({ src }) => /^["']use client["']/.test(src))) {
      expect(src, f).not.toMatch(/from\s+["']@\/lib\/(adsActions|adsUpload|blocApi|supabase)["']/);
    }
  });
  it("every import in the new / changed files exists in the panel's package.json (no happy-dom, no testing-library)", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const BUILTIN = new Set(["crypto", "node:crypto", "node:fs", "node:path", "fs", "path"]);
    const NEW = [
      "lib/adsActions.ts", "lib/adsUi.ts", "lib/adsUpload.ts", "lib/ads.ts", "lib/collectionProviders.ts", "lib/blocApi.ts",
      "app/api/ads/route.ts", "app/api/ads/upload/route.ts", "app/(panel)/ads/campaigns/[id]/page.tsx", "app/(panel)/buildings/[id]/page.tsx",
      "components/ads/adsKit.tsx", "components/ads/CreativeManager.tsx", "components/ads/CreativeImageField.tsx", "components/ads/CampaignEditor.tsx",
      "components/ads/AdsForms.tsx", "components/ui/BillingFactsCard.tsx",
    ];
    const bad: string[] = [];
    for (const f of NEW) {
      for (const m of read(f).matchAll(/(?:^|\n)\s*import[^"']*["']([^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("@/") || BUILTIN.has(spec)) continue;
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!deps.has(name)) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
    expect(deps.has("happy-dom")).toBe(false);
    expect(deps.has("@testing-library/react")).toBe(false);
  });
});
