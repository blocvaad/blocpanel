"use client";
// CreativeManager — הפרסומות של קמפיין (bloc ADS-1): תמונה (העלאה לבאקט 'ads', או כתובת https), תיאור לקורא
// מסך, כותרת, משפט, כפתור וקישור — עם תצוגה מקדימה בטלפון, בדיוק כמו אצל הדייר. כמה פרסומות בקמפיין —
// מתחלפות (מי שהוצגה הכי מעט — קודם), והדוח משווה ביניהן. פרסומת שהוצגה — התוכן קבוע: משביתים ומוסיפים חדשה.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Section, Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, uploadAdImage, Field } from "./adsKit";
import AdPhonePreview from "./AdPhonePreview";
import { AD_IMAGE_MAX_BYTES, fmtInt } from "@/lib/ads";
import type { AdCreativeRow } from "@/lib/adsServer";

type Draft = { id?: string; image_url: string; image_alt: string; headline: string; body: string; cta_label: string; cta_url: string };
const EMPTY: Draft = { image_url: "", image_alt: "", headline: "", body: "", cta_label: "לפרטים", cta_url: "" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" };

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function CreativeManager({ campaignId, advertiser, creatives, creativeServes, canManage }: {
  campaignId: string; advertiser: string; creatives: AdCreativeRow[]; creativeServes: Record<string, number>; canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownOnce = (id?: string) => !!id && (creativeServes[id] ?? 0) > 0;
  const contentLocked = shownOnce(draft?.id);

  async function upload(file: File | undefined) {
    if (!file || !draft) return;
    if (file.size > AD_IMAGE_MAX_BYTES) { setErr("התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב."); return; }
    setBusy("upload"); setErr(null);
    const r = await uploadAdImage(file);
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setDraft((d) => (d ? { ...d, image_url: r.data.url } : d));
  }

  async function save() {
    if (!draft) return;
    setBusy("save"); setErr(null); setNotice(null);
    const r = await postAds({
      action: "creative.save", ...(draft.id ? { id: draft.id } : {}), campaign_id: campaignId,
      image_url: draft.image_url, image_alt: draft.image_alt, headline: draft.headline, body: draft.body,
      cta_label: draft.cta_label, cta_url: draft.cta_url,
    });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setDraft(null);
    setNotice(draft.id ? "הפרסומת עודכנה." : "הפרסומת נוספה.");
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

  const ready = !!draft && !!draft.image_url && draft.image_alt.trim().length >= 2 && draft.headline.trim().length >= 2
    && draft.cta_label.trim().length >= 2 && /^https:\/\/\S+$/.test(draft.cta_url.trim());

  return (
    <Section title="הפרסומות בקמפיין" id="creatives"
      hint="תמונה 1080×1350 (4:5), עד 2MB. תמונה ביחס אחר ממלאת את אותה מסגרת, והעודף נחתך: בדקו בתצוגה המקדימה. כמה פרסומות — מתחלפות באופן אחיד, והדוח משווה ביניהן.">
      {notice && <Banner tone="ok"><span data-creative-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-creative-error="">{err}</span></Banner>}
      {creatives.length === 0 && !draft && (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-creatives-empty="">אין עדיין פרסומת. בלי פרסומת פעילה אי אפשר להפעיל את הקמפיין.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {creatives.map((c) => (
          <div key={c.id} data-creative-row={c.id}
            style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", padding: "10px", borderRadius: "12px", border: "1px solid var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image_url} alt={c.image_alt} style={{ width: "56px", height: "70px", objectFit: "cover", borderRadius: "8px", flexShrink: 0, background: "var(--surface)", opacity: c.active ? 1 : 0.5 }} />
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "15px", fontWeight: 700, color: c.active ? "var(--text)" : "var(--text-2)" }}>{c.headline}</span>
                {!c.active && <Tag tone="muted">מושבתת</Tag>}
              </div>
              <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>
                {c.cta_label}, {hostOf(c.cta_url)}{shownOnce(c.id) ? `, הוגשה ${fmtInt(creativeServes[c.id])} פעמים` : ""}
              </div>
            </div>
            {canManage && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0, marginInlineStart: "auto" }}>
                <button type="button" style={ghostBtn} aria-label="עריכה" disabled={!!busy}
                  onClick={() => { setErr(null); setDraft({ id: c.id, image_url: c.image_url, image_alt: c.image_alt, headline: c.headline, body: c.body ?? "", cta_label: c.cta_label, cta_url: c.cta_url }); }}>
                  <Pencil size={15} />
                </button>
                <button type="button" style={ghostBtn} aria-label={c.active ? "השבתה" : "הפעלה"} disabled={busy === `act-${c.id}`} data-creative-toggle={c.id}
                  onClick={() => void act(`act-${c.id}`, { action: "creative.active", id: c.id, active: !c.active }, c.active ? "הפרסומת הושבתה." : "הפרסומת הופעלה.")}>
                  {c.active ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                {!shownOnce(c.id) && (
                  <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} aria-label="מחיקה" disabled={busy === `del-${c.id}`}
                    onClick={() => void act(`del-${c.id}`, { action: "creative.delete", id: c.id }, "הפרסומת נמחקה.", "למחוק את הפרסומת?")}>
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
          <button type="button" style={solidBtn("var(--blue)")} onClick={() => { setErr(null); setDraft({ ...EMPTY }); }} data-creative-new="">
            <Plus size={17} />פרסומת חדשה
          </button>
        </div>
      )}

      {draft && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start", paddingTop: "8px", borderTop: "1px solid var(--border)" }} data-creative-form="">
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
            {contentLocked && <Banner tone="info">הפרסומת הזו כבר הוצגה, ולכן התוכן שלה קבוע. אפשר לתקן רק את התיאור של התמונה. לשינוי — פרסומת חדשה.</Banner>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void upload(e.target.files?.[0]); e.target.value = ""; }} data-creative-file="" />
              <button type="button" style={ghostBtn} disabled={contentLocked || busy === "upload"} onClick={() => fileRef.current?.click()} data-creative-upload="">
                <Upload size={15} />{busy === "upload" ? "מעלים…" : draft.image_url ? "החלפת התמונה" : "העלאת תמונה"}
              </button>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>JPEG, PNG או WebP</span>
            </div>
            <Field label="או כתובת של תמונה">
              <input value={draft.image_url} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, image_url: e.target.value })}
                placeholder="https://" dir="ltr" style={inputStyle} data-creative-field="image_url" />
            </Field>
            <Field label="מה רואים בתמונה (לקורא מסך)">
              <input value={draft.image_alt} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, image_alt: e.target.value })}
                style={inputStyle} data-creative-field="image_alt" />
            </Field>
            <div style={grid}>
              <Field label={`כותרת (${draft.headline.length}/60)`}>
                <input value={draft.headline} maxLength={60} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, headline: e.target.value })}
                  style={inputStyle} data-creative-field="headline" />
              </Field>
              <Field label={`כפתור (${draft.cta_label.length}/24)`}>
                <input value={draft.cta_label} maxLength={24} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, cta_label: e.target.value })}
                  style={inputStyle} data-creative-field="cta_label" />
              </Field>
            </div>
            <Field label={`משפט (לא חובה, ${draft.body.length}/180)`}>
              <input value={draft.body} maxLength={180} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, body: e.target.value })}
                style={inputStyle} data-creative-field="body" />
            </Field>
            <Field label="לאן הכפתור מוביל" hint="נפתח בלשונית חדשה. מתווספים תגי utm של bloc, אלא אם יש בקישור משלכם.">
              <input value={draft.cta_url} disabled={contentLocked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, cta_url: e.target.value })}
                placeholder="https://" dir="ltr" style={inputStyle} data-creative-field="cta_url" />
            </Field>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => void save()} disabled={!ready || !!busy} style={{ ...solidBtn("var(--blue)"), opacity: !ready || busy ? 0.6 : 1 }} data-creative-save="">
                {busy === "save" ? "שומרים…" : "שמירת הפרסומת"}
              </button>
              <button type="button" onClick={() => setDraft(null)} disabled={!!busy} style={ghostBtn}>ביטול</button>
            </div>
          </div>
          <AdPhonePreview advertiser={advertiser} imageUrl={/^https:\/\//.test(draft.image_url) ? draft.image_url : null} imageAlt={draft.image_alt}
            headline={draft.headline} body={draft.body.trim() || null} ctaLabel={draft.cta_label} />
        </div>
      )}
    </Section>
  );
}
