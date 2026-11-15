"use client";
// CreativeManager — הפרסומות של קמפיין (bloc ADS-1): תמונה, תיאור לקורא מסך, כותרת, משפט, כפתור וקישור — עם תצוגה
// מקדימה בטלפון, בדיוק כמו אצל הדייר. כמה פרסומות בקמפיין — מתחלפות (מי שהוצגה הכי מעט — קודם), והדוח משווה ביניהן.
// פרסומת שהוצגה — התוכן קבוע: משביתים ומוסיפים חדשה.
// PANEL-PAY א2ב (החלטות 371–373): השמירה רצה ב-bloc. התמונה — רק דרך כפתור ההעלאה (אין יותר שדה "כתובת של תמונה": bloc
// מקבל רק תמונה מהבאקט שלו, ותמונה מאתר אחר לא מוצגת לדיירים). תיבת התמונה אומרת מה קורה בהעלאה; פרסומת ישנה עם תמונה
// מאתר אחר מסומנת. תשובה לא ברורה לפרסומת חדשה — אין "שמירה" שנייה (כפילות), רק רענון.
// CreativeManager — המצב והבקשות; CreativeManagerView — התצוגה (טהורה, נבדקת בלי DOM).
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Section, Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, uploadAdImage, Field } from "./adsKit";
import AdPhonePreview from "./AdPhonePreview";
import CreativeImageField from "./CreativeImageField";
import { AD_IMAGE_MAX_BYTES, fmtInt } from "@/lib/ads";
import { adsImageBase, imageBoxState, isOurAdImage, lockedAfter, RECHECK_TEXT, type ImageBox, type UploadState } from "@/lib/adsUi";
import type { AdCreativeRow } from "@/lib/adsServer";

export type CreativeDraft = { id?: string; image_url: string; image_alt: string; headline: string; body: string; cta_label: string; cta_url: string };
const EMPTY: CreativeDraft = { image_url: "", image_alt: "", headline: "", body: "", cta_label: "לפרטים", cta_url: "" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" };
const IDLE: UploadState = { phase: "idle" };
/** הכתובת הציבורית של הבאקט 'ads' — אותו פרויקט Supabase כמו bloc (NEXT_PUBLIC_SUPABASE_URL נכנס לחבילת הדפדפן). */
const ENV_IMAGE_BASE = adsImageBase(process.env.NEXT_PUBLIC_SUPABASE_URL);

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** אפשר לשמור: תמונה (לא מאתר אחר), תיאור, כותרת, כפתור וקישור https. */
export function creativeReady(d: CreativeDraft, base: string | null): boolean {
  return !!d.image_url && isOurAdImage(d.image_url, base) !== false && d.image_alt.trim().length >= 2 && d.headline.trim().length >= 2
    && d.cta_label.trim().length >= 2 && /^https:\/\/\S+$/.test(d.cta_url.trim());
}

export default function CreativeManager({ campaignId, advertiser, creatives, creativeServes, canManage, imageBase = ENV_IMAGE_BASE }: {
  campaignId: string; advertiser: string; creatives: AdCreativeRow[]; creativeServes: Record<string, number>; canManage: boolean;
  /** בבדיקות בלבד — ברירת המחדל מ-NEXT_PUBLIC_SUPABASE_URL. */
  imageBase?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CreativeDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>(IDLE);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function open(d: CreativeDraft | null) {
    setErr(null); setUpload(IDLE); setRefusal(null); setStale(false);
    setDraft(d);
  }

  async function pickImage(file: File | undefined) {
    if (!file || !draft) return;
    setRefusal(null); setErr(null);
    if (file.size > AD_IMAGE_MAX_BYTES) { setUpload({ phase: "failed", error: "התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב." }); return; }
    setUpload({ phase: "uploading", name: file.name });
    const r = await uploadAdImage(file);
    if (!r.ok) { setUpload({ phase: "failed", error: r.error }); return; }
    setDraft((d) => (d ? { ...d, image_url: r.url } : d));
    setUpload({ phase: "done", name: file.name });
  }

  async function save() {
    if (!draft) return;
    setBusy("save"); setErr(null); setNotice(null); setRefusal(null);
    const r = await postAds({
      action: "creative.save", ...(draft.id ? { id: draft.id } : {}), campaign_id: campaignId,
      image_url: draft.image_url, image_alt: draft.image_alt, headline: draft.headline, body: draft.body,
      cta_label: draft.cta_label, cta_url: draft.cta_url,
    });
    setBusy(null);
    if (!r.ok) {
      // bloc סירב לתמונה — המשפט ליד התמונה, עם כפתור ההעלאה.
      if (r.code === "image_not_ours") { setRefusal(r.error); return; }
      setErr(r.error);
      if (lockedAfter(r, !draft.id)) setStale(true);
      return;
    }
    open(null);
    setNotice(draft.id ? "הפרסומת עודכנה." : "הפרסומת נוספה.");
    router.refresh();
  }

  /** אחרי תשובה לא ברורה לפרסומת חדשה: סוגרים את הטופס ומרעננים — הרשימה תראה אם היא נוספה. */
  function recheck() {
    open(null);
    setNotice(RECHECK_TEXT.creative);
    router.refresh();
  }

  async function act(key: string, body: Record<string, unknown>, msg: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setErr(null); setNotice(null);
    const r = await postAds(body);
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setNotice(msg);
    router.refresh();
  }

  const box = draft ? imageBoxState({ url: draft.image_url, upload, refusal, base: imageBase }) : null;
  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} data-creative-file="" />
      <CreativeManagerView advertiser={advertiser} creatives={creatives} creativeServes={creativeServes} canManage={canManage} imageBase={imageBase}
        draft={draft} box={box} busy={busy} err={err} notice={notice} stale={stale}
        onNew={() => open({ ...EMPTY })} onEdit={(c) => open({ id: c.id, image_url: c.image_url, image_alt: c.image_alt, headline: c.headline, body: c.body ?? "", cta_label: c.cta_label, cta_url: c.cta_url })}
        onToggle={(c) => void act(`act-${c.id}`, { action: "creative.active", id: c.id, active: !c.active }, c.active ? "הפרסומת הושבתה." : "הפרסומת הופעלה.")}
        onDelete={(c) => void act(`del-${c.id}`, { action: "creative.delete", id: c.id }, "הפרסומת נמחקה.", "למחוק את הפרסומת?")}
        onChange={(d) => setDraft(d)} onPick={() => fileRef.current?.click()} onSave={() => void save()} onCancel={() => open(null)} onRecheck={recheck} />
    </>
  );
}

export function CreativeManagerView({
  advertiser, creatives, creativeServes, canManage, imageBase, draft, box, busy, err, notice, stale,
  onNew, onEdit, onToggle, onDelete, onChange, onPick, onSave, onCancel, onRecheck,
}: {
  advertiser: string; creatives: AdCreativeRow[]; creativeServes: Record<string, number>; canManage: boolean; imageBase: string | null;
  draft: CreativeDraft | null; box: ImageBox | null; busy: string | null; err: string | null; notice: string | null;
  /** תשובה לא ברורה לפרסומת חדשה — "שמירה" נעולה, ובהודעה כפתור "רענון". */
  stale: boolean;
  onNew: () => void; onEdit: (c: AdCreativeRow) => void; onToggle: (c: AdCreativeRow) => void; onDelete: (c: AdCreativeRow) => void;
  onChange: (d: CreativeDraft) => void; onPick: () => void; onSave: () => void; onCancel: () => void; onRecheck: () => void;
}) {
  const shownOnce = (id?: string) => !!id && (creativeServes[id] ?? 0) > 0;
  const contentLocked = shownOnce(draft?.id);
  const uploading = !!box?.busy;
  const ready = !!draft && creativeReady(draft, imageBase);
  const canSave = ready && !busy && !uploading && !stale;
  const foreign = (url: string) => isOurAdImage(url, imageBase) === false;

  return (
    <Section title="הפרסומות בקמפיין" id="creatives"
      hint={"תמונה \u20661080×1350\u2069 (4:5), עד 2MB. תמונה ביחס אחר ממלאת את אותה מסגרת, והעודף נחתך: בדקו בתצוגה המקדימה. כמה פרסומות — מתחלפות באופן אחיד, והדוח משווה ביניהן."}>
      {notice && <Banner tone="ok"><span data-creative-notice="">{notice}</span></Banner>}
      {err && (
        <Banner tone="error" action={stale ? <button type="button" style={ghostBtn} onClick={onRecheck} data-creative-recheck="">רענון</button> : undefined}>
          <span data-creative-error="">{err}</span>
        </Banner>
      )}
      {creatives.length === 0 && !draft && (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-creatives-empty="">אין עדיין פרסומת. בלי פרסומת פעילה אי אפשר להפעיל את הקמפיין.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {creatives.map((c) => (
          <div key={c.id} data-creative-row={c.id}
            style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", padding: "10px", borderRadius: "12px", border: "1px solid var(--border)" }}>
            {foreign(c.image_url)
              // סקירה א2ב (#11): תמונה מאתר אחר לא נטענת גם בפאנל — בלי פנייה לצד שלישי
              ? <div aria-hidden="true" data-creative-thumb="foreign" style={{ width: "56px", height: "70px", borderRadius: "8px", flexShrink: 0, background: "var(--surface)", border: "1px dashed var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "11px", textAlign: "center", lineHeight: 1.3 }}>מאתר<br />אחר</div>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={c.image_url} alt={c.image_alt} style={{ width: "56px", height: "70px", objectFit: "cover", borderRadius: "8px", flexShrink: 0, background: "var(--surface)", opacity: c.active ? 1 : 0.5 }} />}
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "15px", fontWeight: 700, color: c.active ? "var(--text)" : "var(--text-2)" }}>{c.headline}</span>
                {!c.active && <Tag tone="muted">מושבתת</Tag>}
                {foreign(c.image_url) && <span data-creative-foreign={c.id}><Tag tone="danger">תמונה מאתר אחר — לא מוצגת</Tag></span>}
              </div>
              <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>
                {c.cta_label}, {hostOf(c.cta_url)}{shownOnce(c.id) ? `, הוגשה ${fmtInt(creativeServes[c.id])} פעמים` : ""}
              </div>
            </div>
            {canManage && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0, marginInlineStart: "auto" }}>
                <button type="button" style={ghostBtn} aria-label="עריכה" disabled={!!busy || uploading} onClick={() => onEdit(c)}>
                  <Pencil size={15} />
                </button>
                <button type="button" style={ghostBtn} aria-label={c.active ? "השבתה" : "הפעלה"} disabled={busy === `act-${c.id}`} data-creative-toggle={c.id}
                  onClick={() => onToggle(c)}>
                  {c.active ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                {!shownOnce(c.id) && (
                  <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} aria-label="מחיקה" disabled={busy === `del-${c.id}`}
                    onClick={() => onDelete(c)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && !draft && (
        <div>
          <button type="button" style={solidBtn("var(--blue)")} onClick={onNew} data-creative-new="">
            <Plus size={17} />פרסומת חדשה
          </button>
        </div>
      )}

      {draft && box && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start", paddingTop: "8px", borderTop: "1px solid var(--border)" }} data-creative-form="">
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
            {contentLocked && <Banner tone="info">הפרסומת הזו כבר הוצגה, ולכן התוכן שלה קבוע. אפשר לתקן רק את התיאור של התמונה. לשינוי — פרסומת חדשה.</Banner>}
            <CreativeImageField url={foreign(draft.image_url) ? "" : draft.image_url} box={box} locked={contentLocked} onPick={onPick} />
            <Field label="מה רואים בתמונה (לקורא מסך)">
              <input value={draft.image_alt} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, image_alt: e.target.value })}
                style={inputStyle} data-creative-field="image_alt" />
            </Field>
            <div style={grid}>
              <Field label={`כותרת (${draft.headline.length}/60)`}>
                <input value={draft.headline} maxLength={60} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, headline: e.target.value })}
                  style={inputStyle} data-creative-field="headline" />
              </Field>
              <Field label={`כפתור (${draft.cta_label.length}/24)`}>
                <input value={draft.cta_label} maxLength={24} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, cta_label: e.target.value })}
                  style={inputStyle} data-creative-field="cta_label" />
              </Field>
            </div>
            <Field label={`משפט (לא חובה, ${draft.body.length}/180)`}>
              <input value={draft.body} maxLength={180} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, body: e.target.value })}
                style={inputStyle} data-creative-field="body" />
            </Field>
            <Field label="לאן הכפתור מוביל" hint="נפתח בלשונית חדשה. מתווספים תגי utm של bloc, אלא אם יש בקישור משלכם.">
              <input value={draft.cta_url} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, cta_url: e.target.value })}
                placeholder="https://" dir="ltr" style={inputStyle} data-creative-field="cta_url" />
            </Field>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={onSave} disabled={!canSave} style={{ ...solidBtn("var(--blue)"), opacity: canSave ? 1 : 0.6 }} data-creative-save="">
                {busy === "save" ? "שומרים…" : "שמירת הפרסומת"}
              </button>
              <button type="button" onClick={onCancel} disabled={!!busy || uploading} style={ghostBtn}>ביטול</button>
            </div>
          </div>
          <AdPhonePreview advertiser={advertiser} imageUrl={/^https:\/\//.test(draft.image_url) && !foreign(draft.image_url) ? draft.image_url : null} imageAlt={draft.image_alt}
            headline={draft.headline} body={draft.body.trim() || null} ctaLabel={draft.cta_label} />
        </div>
      )}
    </Section>
  );
}
