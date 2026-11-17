// ADS-2ב2 wiring (החלטות 393–399) — מה שחייב להישאר מחובר בסטודיו שלב אחר שלב:
//   • העלאה לכל פורמט לבד: הריצה נבנית מ-publishStart (מה שעלה לא עולה שוב), אותו creative.save, ו-onDone רק כשכל הפורמטים שנבחרו עלו
//     (לא batchDone של מה שרץ עכשיו — אחרת העלאה של פורמט אחד הייתה סוגרת את הסטודיו).
//   • הכפתור של פורמט מופיע רק כשאין חסר; כשחסר — "להשלמה" שקופץ לשדה; ההעלאה חסומה באמצע פעולה, בזמן העלאת תמונה ואחרי תשובה לא ברורה.
//   • החלקה: לא כשהמגע התחיל בשדה / מחוון / שורה שגוללת לצד (NO_SWIPE); הכיוון מ-swipeIntent (RTL); הקפיצה — checkSelector + מיקוד.
//   • הגיליון: כשיש עבודה שלא נשמרה — סגירה (X, מחוץ לגיליון, Escape) שואלת קודם; באמצע העלאה — לא נסגר; סגירה אחרי שחלק עלה
//     (או אחרי תשובה לא ברורה) מרעננת ואומרת מה נוצר. בזמן העלאה הטופס נעול, והבקשות נבנות מתמונת מצב; הסטודיו נסגר — אין בקשה נוספת.
//   • באשף הקמפיין (הסקירה העצמאית, P1): הסטודיו שבמקום הרשימה — הפס שלו הצמוד, של האשף שורה רגילה; יציאה מהשלב שואלת / חסומה.
//   • פורמט שעלה לא יוצא מהבחירה; עזרי התמונות לא במודעה נעולה.
//   • ES2017 בקבצים החדשים / שהשתנו (כמו בשאר הפאנל).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sheetCloseAction } from "@/components/ads/studio/kit";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const STUDIO = "components/ads/studio/CreativeStudio.tsx";
const FILES = [
  "lib/adsWizard.ts", "components/ads/studio/WizardSteps.tsx", STUDIO, "components/ads/studio/FramesStrip.tsx",
  "components/ads/studio/FormatGallery.tsx", "components/ads/studio/kit.tsx", "components/ads/studio/CreativeList.tsx", "components/ads/studio/CampaignWizard.tsx",
];

describe("uploading per format (394)", () => {
  it("the run comes from publishStart, sends the same creative.save per format, and finishes only when every chosen format is up", () => {
    const s = code(STUDIO);
    expect(s).toContain("onPublish={(formats) => void run(publishStart(batch, formats))}");
    expect(s).toContain("const r = await postAds<{ id: string }>(creativePayloadFor(format, snap, campaignId));");
    expect(s).toContain("if (allUploaded(snap.formats, list)) onDone(doneText(snap.formats.length));");
    expect(s).not.toContain("batchDone(");
    expect(s).toContain("if (lockedAfter(r, true)) setStale(true);");
  });
  it("review #2 — every request of a run is built from the form as it was when pressed, and the form is locked while it runs", () => {
    const s = code(STUDIO);
    expect(s).toContain("const snap = formRef.current;");
    expect(s).not.toContain("creativePayloadFor(format, formRef.current");
    expect(s).toContain("const k = snap.frames[r.frame]?.key;");
    expect(s).toContain('<fieldset disabled={on} className="wiz-lock" data-studio-lock={on ? "on" : "off"}>{children}</fieldset>');
    expect(s.match(/<Lock on=\{p\.busy\}>/g)).toHaveLength(3);   // the gallery, the content's fields, a format's image / frames / style
    expect(s).toContain("focal={img.focal} disabled={locked || p.busy}");   // the focal slider is a div — a fieldset does not reach it
    expect(code("components/ads/studio/FramesStrip.tsx")).toContain("formats={formats} disabled={off} testId={`frame-${cur}`}");
    expect(code("components/ads/studio/FocalPicker.tsx")).toContain("{ if (!disabled && e.buttons & 1) point(e); }");
  });
  it("review #3 — after the studio is gone no further request is sent, and nothing reports back", () => {
    const s = code(STUDIO);
    expect(s).toContain("useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);");
    expect(s).toContain('if (!alive.current) return { ok: false, error: "הסטודיו נסגר לפני ההעלאה.", unclear: false };');
    expect(s).toContain("if (!alive.current) return;\n    setBusy(false);");
    // second review #10: several images at once stop too, and a single image upload never starts or lands after the studio is gone
    expect(s).toContain("for (let i = 0; i < keys.length; i++) { if (!alive.current) return; await uploadTo(keys[i], files[i]); }");
    expect(s).toContain("if (!alive.current) return;\n    mark({ phase: \"uploading\", name: file.name });\n    const r = await uploadAdImage(file);\n    if (!alive.current) return;");
  });
  it("a format's upload button only with nothing missing; blocked while busy, while an image uploads, after an unclear answer, while a run goes", () => {
    const s = code(STUDIO);
    expect(s).toContain("const free = !p.busy && !uploading && !p.stale && !running;");
    expect(s).toContain("const m = formatMain(step, checks, p.batch, free);");
    expect(s).toContain("onClick={() => p.onPublish([step])} disabled={!m.enabled} data-creative-publish={step}");
    // the summary uploads only what can go up now (canUpload: nothing missing, not up, not mid-run, not unclear)
    expect(s).toContain("const readyNow = readyToUpload(form.formats, checksOf, p.batch);");
    // the edit gate is the old one, word for word
    expect(s).toContain("const canSave = ready && !p.busy && !uploading && !p.stale;");
  });
  it("an uploaded format stays chosen (the gallery locks it); the frames' helpers never on a locked ad", () => {
    expect(code(STUDIO)).toContain("locked={uploaded} />");
    expect(code("components/ads/studio/FormatGallery.tsx")).toContain("onClick={() => { if (!disabled && !up) onChange(toggleFormat(value, f)); }}");
    expect(code("components/ads/studio/FramesStrip.tsx")).toContain("{(onPickMany || onFillAlts) && !locked && (");
  });
});

describe("steps, swipe and the jump to a field (393, 395, 396)", () => {
  it("swipe: ignored from fields / sliders / sideways rows; the direction from swipeIntent; the step beside the shown one", () => {
    const s = code(STUDIO);
    expect(s).toContain("touchAt.current = !t || e.touches.length > 1 || from?.closest?.(NO_SWIPE) ? null : { x: t.clientX, y: t.clientY, t: Date.now() };");
    expect(s).toContain("const intent = swipeIntent(t.clientX - s.x, t.clientY - s.y, Date.now() - s.t);");
    expect(s).toContain('const to = intent ? stepBeside(shown, steps, intent === "next" ? 1 : -1) : null;');
    expect(s).toContain("onTouchStart={p.touch?.onTouchStart} onTouchEnd={p.touch?.onTouchEnd}");
  });
  it("the jump: to the step, the frame selected, then the field focused (after it renders) and flashed", () => {
    const s = code(STUDIO);
    expect(s).toContain("if (c.frame !== undefined) setFrameSel(c.frame);");
    expect(s).toContain("setFlagged((xs) => (xs.includes(c.field) ? xs : [...xs, c.field]));");
    expect(s).toContain("setFocusReq({ sel: checkSelector(c), n: Date.now() });");
    expect(s).toContain("const el = rootRef.current?.querySelector<HTMLElement>(focusReq.sel);");
    expect(s).toContain("el.focus?.({ preventScroll: true });");
  });
  it("a removed format's page never stays open: the shown step is always one that exists", () => {
    expect(code(STUDIO)).toContain("const shown = shownStep(step, steps);");
    expect(code(STUDIO)).toContain("const step = shownStep(p.step, steps);");
  });
});

describe("closing (399)", () => {
  it("the sheet: busy → nothing; unsaved work → ask; otherwise close", () => {
    expect(sheetCloseAction(true, "x")).toBe("none");
    expect(sheetCloseAction(false, "x")).toBe("ask");
    expect(sheetCloseAction(false, null)).toBe("close");
    expect(sheetCloseAction(false, undefined)).toBe("close");
  });
  it("every way out of the sheet goes through the same check (X, outside, Escape); Escape while asking keeps editing; the question takes the focus", () => {
    const k = code("components/ads/studio/kit.tsx");
    expect(k).toContain('const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryRef.current(); };');
    expect(k).toContain("const onEscape = () => { if (asking) stay(); else tryClose(); };");
    // "keep editing" gives the focus back to the X; an upload started under the question closes the question
    expect(k).toContain('const stay = () => { setAsking(false); requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("[data-sheet-close]")?.focus()); };');
    expect(k).toContain("useEffect(() => { if (busy) setAsking(false); }, [busy]);");
    expect(k).toContain("onLeave={() => { if (live.current.busy) return; setAsking(false); onClose(); }} />");
    expect(k).toContain('useEffect(() => { if (asking) box.current?.querySelector<HTMLElement>("[data-sheet-guard-stay]")?.focus(); }, [asking]);');
    expect(k).toContain('<div className="studio-sheet-wrap" onClick={() => tryClose()} data-sheet={testId}>');
    expect(k).toContain('<button type="button" data-sheet-close="" onClick={() => tryClose()} disabled={busy} aria-label="סגירה"');
    expect(k).toContain('<button type="button" onClick={onLeave} disabled={busy} data-sheet-guard-close=""');
  });
  it("the list: the studio reports its state; the sheet never closes mid-upload; the guard says what would be lost; closing refreshes after an upload or an unclear answer", () => {
    const l = code("components/ads/studio/CreativeList.tsx");
    expect(l).toContain("onState={setSt} />");
    expect(l).toContain("busy={st.busy} guard={st.dirty ? leaveText(sheet.kind, st.up, st.rest) : null} guardYes={leaveYes(sheet.kind)}>");
    expect(l).toContain("const close = () => { const text = closeOutcome(st.up, st.rest, st.maybe); if (text) { done(text); return; } setSheet(null); setSt(STUDIO_IDLE); };");
    expect(l).toContain("const open = (m: StudioMode) => { setSt(STUDIO_IDLE); setSheet(m); };");
  });
  it("the list in the wizard: the studio stays until it is done, every upload refreshes the campaign, and its state goes up", () => {
    const l = code("components/ads/studio/CreativeList.tsx");
    expect(l).toContain("const [inline, setInline] = useState(inlineWhenEmpty && canManage && creatives.length === 0);");
    expect(l).toContain("useEffect(() => { if (inline && (upN > 0 || st.maybe)) router.refresh(); }, [inline, upN, st.maybe, router]);");
    expect(l).toContain("useEffect(() => { onInline?.(inline ? st : null); }, [inline, st, onInline]);");
    expect(l).toContain("useEffect(() => () => onInline?.(null), [onInline]);");
  });
  it("the studio's own exits: one plan (exitPlan) — ask first when work would be lost, also after part went up; the finish after an upload does not ask", () => {
    const s = code(STUDIO);
    expect(s).toContain("const plan = exitPlan({ busy, dirty: ask && dirty, asked: confirmCancel, up: upNow.length, maybe });");
    expect(s).toContain("const cancel = () => leave(true);");
    expect(s).toContain("const finish = () => leave(upNow.length === 0);");
    expect(s).toContain('if (plan === "recheck") { onDone(RECHECK_TEXT.creative); return; }');
    // the exit question takes the focus; an untouched copy is not "dirty"
    expect(s).toContain('if (confirmCancel) rootRef.current?.querySelector<HTMLElement>("[data-creative-cancel-no]")?.focus?.();');
    expect(s).toContain("initial.current = JSON.stringify(copy);");
    // second review #9: "keep editing" gives the focus back to the button that asked (or the step line) — never to the page behind
    expect(s).toContain('requestAnimationFrame(() => (rootRef.current?.querySelector<HTMLElement>(askFrom.current) ?? rootRef.current?.querySelector<HTMLElement>("[data-wizard-where]"))?.focus?.());');
    expect(code("components/ads/studio/CampaignWizard.tsx")).toContain('onStay={() => { setLeaveTo(null); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-wizard-next]")?.focus()); }} />');
  });
  it("review #1 — the campaign wizard: the studio's state comes up, every way off step 2 goes through leaveOr, the bar knows the studio", () => {
    const w = code("components/ads/studio/CampaignWizard.tsx");
    expect(w).toContain("today={today} campaignEndsOn={form.ends_on || null} onInline={setInlineSt} />");
    expect(w).toContain("reachable={(n) => (n === 1 || !!id) && !(step === 2 && n !== 2 && !!inlineSt?.busy)} onStep={leaveOr} />");
    // second review #1: leaving from the question re-checks the upload; the question goes away when an upload starts or nothing is unsaved
    expect(w).toContain("if (leaveTo === null || inlineSt?.busy) return;");
    expect(w).toContain("useEffect(() => { if (leaveTo !== null && !leaveAskStays(inlineSt)) setLeaveTo(null); }, [leaveTo, inlineSt]);");
    expect(w).toContain('if (leaveTo === "home") { setLeaveTo(null); router.push("/ads"); }');
    expect(w).toContain("onLeave={leaveNow}");
    // second review #4: "לסטודיו" goes through the same question (and does nothing mid-upload)
    expect(w).toContain("if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;");
    expect(w).toContain('if (step === 2 && inlineSt && (inlineSt.busy || inlineSt.dirty)) { e.preventDefault(); leaveOr("home"); }');
    // third review #3: the studio's own question gives way to an upload, like the sheet's and the wizard's
    expect(code(STUDIO)).toContain("useEffect(() => { if (busy) setConfirmCancel(false); }, [busy]);");
    expect(w).toContain("if (step < WIZARD_STEPS.length) { void flush(); leaveOr(step + 1); }");
    expect(w).toContain("inline={step === 2 ? inlineSt : null} leaveTo={leaveTo}");
    expect(w).toContain("onBack={() => leaveOr(step - 1)}");
    expect(w).toContain("if (inlineSt.busy) return;");
    expect(w).toContain("if (inlineSt.dirty) { setLeaveTo(n); return; }");
    // the studio's attributes are its own (no second data-wizard-next / data-wizard-step inside the wizard)
    expect(code(STUDIO)).not.toMatch(/data-wizard-(next|back|step)=/);
  });
});

describe("ES2017 in the new and changed files (as the rest of the panel)", () => {
  it("no lookbehind or named groups, no regex flag s / d / v, no ??= / ||= / &&=", () => {
    for (const f of FILES) {
      const c = code(f);
      expect(c, f).not.toMatch(/\(\?<[=!]|\(\?<[A-Za-z]/);
      expect(c, f).not.toMatch(/\/[gimuy]*[sdv][gimuy]*\s*\.(test|exec)\(|new RegExp\([^)]*,\s*["'][a-z]*[sdv][a-z]*["']\)/);
      expect(c, f).not.toMatch(/\?\?=|\|\|=|&&=/);
    }
  });
  it("no library call newer than ES2017 (no .at( / replaceAll / Object.hasOwn / structuredClone / findLast / toSorted)", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/\.at\(-?\d|\.replaceAll\(|Object\.hasOwn\(|structuredClone\(|\.findLast(Index)?\(|\.toSorted\(|\.toReversed\(/);
  });
  it("no env() inline in a top / bottom / padding / height / width of the new components (happy-dom drops it — MG-S1097)", () => {
    // kit.tsx's StickyBar / Sheet keep their safe-area padding (they were there before; the panel's tests run without a DOM)
    for (const f of ["components/ads/studio/WizardSteps.tsx", STUDIO, "components/ads/studio/FramesStrip.tsx"]) expect(code(f), f).not.toMatch(/(top|bottom|padding\w*|height|width)\s*:\s*["'`][^"'`]*env\(/);
  });
});
