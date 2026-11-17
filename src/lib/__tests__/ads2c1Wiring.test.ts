// bloc ADS-2ג1 בפאנל — בדיקת חיווט לכל כלל חדש (החלטות 400–405).
//   • המסכים מרשימה אחת (SCREENS): הבדיקה (explain — עם הזוג מסך / מקום), ההערכה, השמירה, הקמפיין החדש.
//   • הכפתור: שדה אחד שנשמר (cta_url) — כל שינוי בעורך עובר דרך withCta; השמירה מקבלת tel רק לפי AD_TEL_RE; קרוסלה — אתר בלבד.
//   • utm רק לאתר; "הקלקות" לפי הסוג בדוח; התצוגה — השם לא נחתך בפס; בדיקת משתמש — רק המקומות שיש במסך.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** code without comments. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const STUDIO = "src/components/ads/studio";

describe("the places from one list (decision 400)", () => {
  it("explain: the screen from SCREENS, and the pair checked before bloc is asked", () => {
    const r = code("src/app/api/ads/explain/route.ts");
    expect(r).toContain("screen: z.enum(SCREENS as [AdScreen, ...AdScreen[]]).default(\"home\")");
    expect(r).toContain(".strict().refine((v) => screenHasSlot(v.screen, v.slot), { message: \"במסך הזה אין פרסומת במקום הזה\", path: [\"slot\"] })");
    expect(r.indexOf("const p = await parseBody(req, Schema)")).toBeLessThan(r.indexOf("await callBloc("));
  });
  it("the estimate, the save and the new campaign take the five; the explain parser knows them", () => {
    expect(code("src/app/api/ads/estimate/route.ts")).toContain('screens: subset(["home", "market", "events", "inbox", "announcements"] as const),');
    expect(code("src/lib/validation.ts")).toContain('screens: adSubset(["home", "market", "events", "inbox", "announcements"] as const, "מסך"),');
    expect(code("src/lib/adsStudio.ts")).toContain("screens: [...SCREENS], plans: [\"free\", \"building\"]");
    expect(code("src/lib/adsExplain.ts")).toContain('new Set(["home", "market", "events", "inbox", "announcements"])');
    expect(code("src/lib/ads.ts")).toContain('export const SCREENS: AdScreen[] = ["home", "market", "events", "inbox", "announcements"];');
  });
  it("the user check offers only the places a screen has; the screens picker says where each format shows", () => {
    const box = code(`${STUDIO}/ExplainBox.tsx`);
    expect(box).toContain("const allowed = explainSlots(slots, screen);");
    expect(box).toContain("disabled={!valid || busy || !slot}");
    expect(code(`${STUDIO}/AudienceEditor.tsx`)).toContain("hint={SCREENS_HINT}");
  });
  it("\"not shown\" when no ad fits any chosen screen — liveNow says it before the day and the hour", () => {
    const lib = code("src/lib/ads.ts");
    expect(lib.indexOf("const placed = c.screens && c.placements ? placementIssue(c.screens, c.placements) : null;")).toBeLessThan(lib.indexOf("const { dow, hour } = ilNowParts(now);"));
  });
});

describe("the button (decisions 402, 404, 405)", () => {
  it("the save: the ad's button — https or a phone by AD_TEL_RE (the CHECK of 233); a carousel card — https only", () => {
    const v = code("src/lib/validation.ts");
    expect(v).toContain('import { AD_TEL_RE } from "./adsCta";');
    expect(v).toContain('cta_url: adCtaTarget("הקישור"),');
    expect(v).toMatch(/const adFrame = z\.object\(\{[\s\S]*?cta_url: adOptHttps\("הקישור"\),/);
    expect(v).toContain("AD_TEL_RE.test(v) || httpsUrl(v)");
  });
  it("the editor: every change goes through withCta (the draft and the address together); the content step has no address field of its own", () => {
    const ed = code(`${STUDIO}/CtaEditor.tsx`);
    expect(ed).toContain("const set = (next: Partial<CtaDraft>) => onForm(withCta(form, { ...d, ...next }));");
    expect(ed).toContain("onForm({ ...withCta(form, r.draft), cta_label: r.label });");
    expect(ed.match(/onForm\(\{ \.\.\.form, cta_url/g)).toBeNull();
    const st = code(`${STUDIO}/CreativeStudio.tsx`);
    expect(st).toContain("<CtaEditor form={form} onForm={onForm} campaignId={p.campaignId ?? null} labelIssue={label} urlIssue={url} onFlag={p.onFlag} />");
    expect(st).not.toContain('data-creative-field="cta_url"');
  });
  it("utm only on a website; what is missing per kind (contentChecks and formIssues)", () => {
    const studio = code("src/lib/adsStudio.ts");
    expect(studio).toContain('if (!httpsOk(url) || ctaKindOf(url) !== "link") return null;');
    expect(studio).toContain("const cta = ctaDraftOf(f);");
    expect(code("src/lib/adsWizard.ts")).toContain("const cta = ctaIssue(ctaDraftOf(f));");
  });
  it("the report names taps by the creative's action (a carousel with card links — clicks); the preview never cuts a name", () => {
    const camp = code(`${STUDIO}/CampaignStudio.tsx`);
    expect(camp).toContain('clicksText(r.clicks, c ? clickKindOf(c) : "link", fmtInt)');
    expect(camp).toContain("label={clicksTitle(creatives.map(clickKindOf))}");
    const prev = code(`${STUDIO}/AdPreview.tsx`);
    expect(prev).not.toContain('maxWidth: "96px", overflow: "hidden" }}>{cta}</span>');
    expect(prev).toContain('maxWidth: "132px"');
    // the label: no line limit (review row 1); a carousel card's own link — its own kind, as bloc (review row 9)
    expect(prev).toContain('<span data-ad-preview-cta-label="" style={{ textAlign: "center", overflowWrap: "anywhere" }}>{label}</span>');
    expect(prev).toContain('format === "carousel" && curFrame?.ctaUrl ? ctaKindOf(curFrame.ctaUrl) : p.ctaKind');
  });
  it("one https rule for every address (the CHECKs compare the letters as they are — review row 7)", () => {
    const v = code("src/lib/validation.ts");
    expect(v).toContain('if (!v.startsWith("https://")) return false;');
    expect(v).toContain(".refine(httpsUrl, `${what}: כתובת מלאה שמתחילה ב-https://`);");
    expect(v).toContain(".refine((v) => AD_TEL_RE.test(v) || httpsUrl(v), `${what}: כתובת מלאה שמתחילה ב-https://, או מספר טלפון ישראלי`);");
  });
});
