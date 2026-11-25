"use client";
// homeStudio/CardEditor — העורך של כרטיס במסך הבית (bloc HOME-STUDIO-1, החלטות 684–694): צורה, מקור, מקום במסך, כותרת, פריטים
// (תמונה בלבד / כותרת, טקסט, אייקון, צבע, קישור, כפתור, תגית — הכל לא חובה; תמונה או כותרת — 692), קהל ותאריכים, עם הטלפון החי
// לצד הטופס. כרטיס חדש — תמיד טיוטה; "שליחה לטלפון שלי" — רק לחשבונות שנבחרו; "פרסום" — אחרי שאלה; כרטיס מפורסם שנשמר — מתעדכן
// מיד אצל כולם (נאמר על הכפתור). תשובה לא ברורה ליצירה / לשכפול — אין "שמירה" שנייה, רק רענון (בלי כפילות).
import { useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Copy, Smartphone, Send, Pause, Archive, RefreshCw } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn, inputStyle, textareaStyle } from "@/components/ui/panelKit";
import { ChipSet, Field } from "@/components/ads/adsKit";
import { Segmented, Sheet, StickyBar, STUDIO_CSS, STUDIO_IMAGE_BASE } from "@/components/ads/studio/kit";
import CreativeImageField, { type ThumbShape } from "@/components/ads/CreativeImageField";
import { imageBoxState, type UploadState } from "@/lib/adsUi";
import { AD_IMAGE_MAX_BYTES } from "@/lib/ads";
import {
  ACCENT_INFO, CARD_TRANSITIONS, FREQUENCY_LABEL, HOME_MAP, ICON_LABEL, LIMITS, SHAPE_INFO, SLOT_LABEL, SOURCE_INFO, STATUS_LABEL, STATUS_TONE,
  STUDIO_ACCENTS, STUDIO_ICONS, STUDIO_PLANS, STUDIO_ROLES, STUDIO_ROUTES, STUDIO_SHAPES, WHATS_NEW_SHAPES,
  STUDIO_CAP, cardProblems, emptyItem, endedForm, formField, formFromCard, itemsRule, newItemId, parseCard, payloadOf, previewOf, validity, withShape,
  type CardForm, type ItemForm, type LinkKind, type StudioCard, type StudioRole, type StudioShape, type StudioStatus, type StudioUpdate,
} from "@/lib/homeStudio";
import { PhoneCard, PhoneFrame, STUDIO_ICON } from "./StudioPhone";
import { ShapeGlyph, postStudio, uploadStudioImage, sectionTitle, hintText, errText } from "./hsKit";

const IMAGE_HINT: Record<StudioShape, { shape: ThumbShape; hint: string }> = {
  banner:   { shape: { w: 80, h: 40, label: "2:1" }, hint: "JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1600×800⁩ (2:1)." },
  tile:     { shape: { w: 64, h: 64, label: "1:1" }, hint: "JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1080×1080⁩ (ריבוע)." },
  carousel: { shape: { w: 64, h: 80, label: "4:5" }, hint: "JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1080×1350⁩ (4:5)." },
  list:     { shape: { w: 84, h: 28, label: "3:1" }, hint: "JPEG, PNG או WebP, עד 2MB. תמונה בלבד: ⁦1200×400⁩ (3:1); עם כותרת: ריבוע." },
  deck:     { shape: { w: 64, h: 80, label: "4:5" }, hint: "JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1080×1350⁩ (4:5)." },
  circles:  { shape: { w: 56, h: 56, label: "1:1" }, hint: "JPEG, PNG או WebP, עד 2MB. בעיגול רואים את המרכז; במסך המלא ⁦1080×1350⁩ (4:5)." },
};
const STATUS_ACTION: Partial<Record<StudioStatus, string>> = { draft: "החזרה לטיוטה", paused: "השהיה", archived: "לארכיון" };
const sameForm = (a: CardForm, b: CardForm) => JSON.stringify(payloadOf(a)) === JSON.stringify(payloadOf(b));
const counter = (v: string, max: number) => <span style={{ ...hintText, color: v.trim().length > max ? "var(--red)" : "var(--text-3)" }} className="studio-num">{v.trim().length}/{max}</span>;

export type EditorProps = {
  initial: CardForm; card: StudioCard | null; updates: StudioUpdate[]; canManage: boolean; myEmail: string; now?: Date
  onClose: () => void; onChanged: (card: StudioCard, note: string) => void; onRefresh: () => void
};

export default function CardEditor({ initial, card: card0, updates, canManage, myEmail, now: now0, onClose, onChanged, onRefresh }: EditorProps) {
  const now = now0 ?? new Date();
  const [card, setCard] = useState<StudioCard | null>(card0);
  const [form, setForm] = useState<CardForm>(initial);
  // what bloc has (the card as saved) — the form is dirty against it, never against what the editor was opened with
  const [saved, setSaved] = useState<CardForm>(() => (card0 ? formFromCard(card0) : initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; field: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [shown, setShown] = useState(false);          // the problems are shown after the first try
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [width, setWidth] = useState<320 | 390>(390);
  const [role, setRole] = useState<StudioRole>("tenant");
  const [ask, setAsk] = useState<null | "live" | "test">(null);
  const [emails, setEmails] = useState<string>(() => (card0?.test_emails.length ? card0.test_emails.join(", ") : myEmail));
  const file = useRef<HTMLInputElement | null>(null);
  const pickFor = useRef<string | null>(null);

  const dirty = !card || !sameForm(form, saved);
  const problems = useMemo(() => cardProblems(form, STUDIO_IMAGE_BASE), [form]);
  const visible = shown ? problems : [];
  const problemAt = (field: string) => visible.find((p) => p.field === field || p.field.startsWith(`${field}.`))?.text
    ?? (error?.field && (error.field === field || error.field.startsWith(`${field}.`)) ? error.text : null);
  const preview = previewOf(form, updates, role, now);
  const uploading = Object.values(uploads).some((u) => u.phase === "uploading");
  const readOnly = !canManage || card?.status === "archived" || locked;
  const v = card ? validity(card, now) : null;
  const ended = endedForm(form, now);
  const set = (patch: Partial<CardForm>) => { setForm((f) => ({ ...f, ...patch })); setNote(null); };
  const setItem = (id: string, patch: Partial<ItemForm>) => { setForm((f) => ({ ...f, items: f.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })); setNote(null); };

  function fail(r: { error: string; field?: string; unclear?: boolean }, creates: boolean) {
    setError({ text: r.error, field: formField(r.field ?? null) });
    if (creates && r.unclear) setLocked(true);
  }
  /** שמירה (חדש — טיוטה). מחזיר את הכרטיס השמור, או null. */
  async function save(): Promise<StudioCard | null> {
    if (card && !dirty) return card;
    setShown(true);
    if (problems.length) { setError({ text: problems[0].text, field: problems[0].field }); return null; }
    setBusy("save"); setError(null);
    const r = await postStudio<{ card: unknown; created: boolean }>({ action: "card.save", ...payloadOf(form) });
    setBusy(null);
    if (!r.ok) { fail(r, !card); return null; }
    const c = parseCard(r.data.card);
    if (!c) { setError({ text: "התשובה לא ברורה. רעננו את הדף לפני שמנסים שוב.", field: null }); if (!card) setLocked(true); return null; }
    const f = formFromCard(c);
    setCard(c); setForm(f); setSaved(f);
    onChanged(c, card ? (c.status === "live" ? "נשמר, ומתעדכן עכשיו במסך הבית." : "נשמר.") : "נשמר כטיוטה. שום דבר לא מוצג עד שמפרסמים.");
    setNote(card ? "נשמר." : "נשמר כטיוטה.");
    return c;
  }
  /**
   * מעבר מצב. פרסום ובדיקה — אחרי שמירה (מה שמתפרסם הוא מה שבטופס). השהיה / טיוטה / ארכיון — מיד, בלי לשמור קודם (להוריד כרטיס
   * לא מחכה לטופס תקין); עריכה שלא נשמרה נשארת בטופס, עם הגרסה החדשה.
   */
  async function moveTo(status: StudioStatus, testEmails?: string[]) {
    const publishing = status === "live" || status === "test";
    const keep = !publishing && dirty;
    const c = publishing ? await save() : card;
    if (!c) return;
    setBusy(status); setError(null);
    const r = await postStudio<{ card: unknown }>({ action: "card.status", id: c.id, version: c.version, status, ...(testEmails ? { test_emails: testEmails } : {}) });
    setBusy(null); setAsk(null);
    if (!r.ok) { fail(r, false); return; }
    const n = parseCard(r.data.card);
    if (!n) { setError({ text: "התשובה לא ברורה. רעננו את הדף לפני שמנסים שוב.", field: null }); return; }
    const f = formFromCard(n);
    setCard(n); setSaved(f); setForm((cur) => (keep ? { ...cur, version: n.version } : f));
    const text = status === "live" ? "פורסם. הכרטיס מוצג עכשיו במסך הבית של מי שבקהל." : status === "test" ? "נשלח לבדיקה: הכרטיס מוצג רק בחשבונות שנבחרו, עם התגית \"בבדיקה\"."
      : status === "paused" ? "הושהה. הכרטיס ירד ממסך הבית." : status === "archived" ? "הועבר לארכיון." : "חזר לטיוטה. הכרטיס לא מוצג.";
    setNote(text); onChanged(n, text);
  }
  async function duplicate() {
    if (!card) return;
    setBusy("duplicate"); setError(null);
    const r = await postStudio<{ card: unknown }>({ action: "card.duplicate", id: card.id });
    setBusy(null);
    if (!r.ok) { fail(r, true); return; }
    const n = parseCard(r.data.card);
    if (!n) { setError({ text: "התשובה לא ברורה. רעננו את הדף לפני שמנסים שוב.", field: null }); setLocked(true); return; }
    const f = formFromCard(n);
    setCard(n); setForm(f); setSaved(f); setEmails(myEmail);
    const text = "נוצר עותק כטיוטה, והוא פתוח עכשיו לעריכה.";
    setNote(text); onChanged(n, text);
  }

  // ── הפריטים ──
  const rule = SHAPE_INFO[form.shape];
  const addItem = () => set({ items: [...form.items, emptyItem(newItemId(form.items.map((i) => i.id)))] });
  const removeItem = (id: string) => set({ items: form.items.filter((i) => i.id !== id) });
  const moveItem = (n: number, d: -1 | 1) => { const items = [...form.items]; const [x] = items.splice(n, 1); items.splice(n + d, 0, x); set({ items }); };
  const canAdd = form.shape === "tile" ? form.items.length === 2 : form.items.length < rule.max;
  const canRemove = form.shape === "tile" ? form.items.length === 4 : form.items.length > rule.min;
  async function onFile(f: File | null) {
    const id = pickFor.current;
    pickFor.current = null;
    if (!f || !id) return;
    if (f.size > AD_IMAGE_MAX_BYTES) { setUploads((u) => ({ ...u, [id]: { phase: "failed", error: "התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב." } })); return; }
    setUploads((u) => ({ ...u, [id]: { phase: "uploading", name: f.name } }));
    const r = await uploadStudioImage(f);
    if (!r.ok) { setUploads((u) => ({ ...u, [id]: { phase: "failed", error: r.error } })); return; }
    setUploads((u) => ({ ...u, [id]: { phase: "done", name: f.name } }));
    setItem(id, { image_url: r.url });
  }

  const nextStatuses = card ? CARD_TRANSITIONS[card.status] : [];
  const canLive = !card || nextStatuses.includes("live");
  const canTest = !card || nextStatuses.includes("test");
  const emailList = emails.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const guard = dirty && !readOnly && (card ? true : form.name.trim() !== "" || form.items.some((i) => i.title || i.image_url)) ? "יש שינויים שלא נשמרו. לסגור בלי לשמור?" : null;

  return (
    <Sheet title={card ? `עריכה: ${card.name}` : "כרטיס חדש במסך הבית"} onClose={onClose} busy={!!busy || uploading} wide testId="hs-editor" guard={guard}>
      <style>{STUDIO_CSS}{EDITOR_CSS}</style>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden data-hs-file="" onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {card && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }} data-hs-editor-status={card.status}>
          <Tag tone={STATUS_TONE[card.status]}>{STATUS_LABEL[card.status]}</Tag>
          {v && <Tag tone={v.tone === "info" ? "info" : v.tone === "wait" ? "wait" : "muted"}>{v.text}</Tag>}
          {card.status === "test" && <span style={hintText}>מוצג רק אצל: <bdi>{card.test_emails.join(", ")}</bdi></span>}
        </div>
      )}
      {locked && <Banner tone="warn" action={<button type="button" style={ghostBtn} onClick={onRefresh} data-hs-refresh=""><RefreshCw size={15} /> רענון</button>}>
        לא ברור אם הפעולה בוצעה. רעננו את הרשימה ובדקו לפני שמנסים שוב (כדי שלא ייווצר כרטיס כפול).</Banner>}
      {error && !locked && <Banner tone="error">{error.text}</Banner>}
      {note && !error && <Banner tone="ok">{note}</Banner>}
      {!canManage && <Banner tone="info">צפייה בלבד: עריכה ופרסום — למנהל ולסופר-אדמין.</Banner>}

      <div className="hs-editor-grid">
        <div className="hs-editor-form" style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
            <Field label="שם הכרטיס (רק הצוות רואה)">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={LIMITS.name + 20} style={inputStyle} data-hs-name="" aria-invalid={!!problemAt("name")} />
              {problemAt("name") && <span style={errText}>{problemAt("name")}</span>}
            </Field>

            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }} aria-label="הצורה">
              <span style={sectionTitle}>הצורה</span>
              <div role="radiogroup" aria-label="הצורה" className="hs-shapes">
                {STUDIO_SHAPES.map((s) => {
                  const on = form.shape === s;
                  const off = form.source === "whats_new" && !WHATS_NEW_SHAPES.includes(s);
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on} disabled={off} data-hs-shape={s} onClick={() => { if (!on) setForm((f) => withShape(f, s)); }}
                      style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", padding: "8px 10px", borderRadius: "12px", textAlign: "start", fontFamily: "inherit",
                        border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.12)" : "transparent", color: "var(--text)", opacity: off ? 0.4 : 1 }}>
                      <ShapeGlyph shape={s} color={on ? "#60a5fa" : "#71717a"} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "14px", fontWeight: 700 }}>{SHAPE_INFO[s].label}</span>
                        <span style={{ display: "block", ...hintText }}>{SHAPE_INFO[s].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {problemAt("shape") && <span style={errText}>{problemAt("shape")}</span>}
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={sectionTitle}>מה בכרטיס</span>
              <Segmented<CardForm["source"]> label="מה בכרטיס" testId="hs-source" value={form.source} onChange={(src) => setForm((f) => {
                const shape = src === "whats_new" && !WHATS_NEW_SHAPES.includes(f.shape) ? "deck" : f.shape;
                const next = { ...f, source: src, shape };
                return src === "manual" ? withShape({ ...next, items: next.items.length ? next.items : [] }, shape) : next;
              })} options={[{ key: "manual", label: SOURCE_INFO.manual.label }, { key: "whats_new", label: SOURCE_INFO.whats_new.label }]} />
              <span style={hintText}>{SOURCE_INFO[form.source].hint}</span>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={sectionTitle}>איפה במסך הבית</span>
              <div className="hs-row">
                <Field label="אחרי איזו שורה">
                  <select value={form.slot} onChange={(e) => set({ slot: e.target.value as CardForm["slot"] })} style={inputStyle} data-hs-slot="">
                    {HOME_MAP.map((r) => <option key={r.slot} value={r.slot}>{SLOT_LABEL[r.slot]}</option>)}
                    <option value="end">{SLOT_LABEL.end}</option>
                  </select>
                </Field>
                <Field label="סדר באותו מקום" hint="כמה כרטיסים באותו מקום: הקטן קודם.">
                  <input type="number" min={0} max={99} value={form.position} onChange={(e) => set({ position: Math.max(0, Math.min(99, Math.trunc(Number(e.target.value) || 0))) })} style={inputStyle} data-hs-position="" />
                </Field>
              </div>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={sectionTitle}>כותרת מעל הכרטיס (לא חובה)</span>
              <div className="hs-row">
                <Field label="כותרת">
                  <input value={form.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} data-hs-title="" />
                  {counter(form.title, LIMITS.cardTitle)}
                </Field>
                <Field label="משפט מתחת לכותרת">
                  <input value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} style={inputStyle} data-hs-subtitle="" />
                  {counter(form.subtitle, LIMITS.cardSubtitle)}
                </Field>
              </div>
              {form.shape === "banner" && form.source === "manual" && (
                <Segmented<CardForm["style"]> label="הסגנון" testId="hs-style" value={form.style} onChange={(s) => set({ style: s })}
                  options={[{ key: "soft", label: "בהיר, בצבע של הפריט" }, { key: "solid", label: "כחול מלא" }]} />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", fontSize: "14px", color: form.end_day ? "var(--text)" : "var(--text-3)" }}>
                <input type="checkbox" checked={form.countdown} disabled={!form.end_day} onChange={(e) => set({ countdown: e.target.checked })} data-hs-countdown="" style={{ width: "20px", height: "20px" }} />
                תגית &quot;נשארו עוד N ימים&quot; עד היום האחרון {form.end_day ? "" : "(צריך תאריך סיום)"}
              </label>
            </section>

            {form.source === "manual" && (
              <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="הפריטים">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <span style={sectionTitle}>הפריטים</span>
                  <span style={hintText} data-hs-items-rule="">ל{rule.label}: {itemsRule(form.shape)} פריטים. בכל פריט: תמונה או כותרת, השאר לבחירתך.</span>
                </div>
                {problemAt("items") && !problemAt("items.0") && <span style={errText}>{problemAt("items")}</span>}
                {form.items.map((it, n) => (
                  <ItemEditor key={it.id} item={it} n={n} total={form.items.length} shape={form.shape} canRemove={canRemove}
                    upload={uploads[it.id] ?? { phase: "idle" }} problem={(f) => problemAt(f === "" ? `items.${n}` : `items.${n}.${f}`)}
                    onChange={(p) => setItem(it.id, p)} onRemove={() => removeItem(it.id)} onMove={(d) => moveItem(n, d)}
                    onPick={() => { pickFor.current = it.id; file.current?.click(); }} />
                ))}
                {canAdd && (
                  <button type="button" onClick={addItem} style={{ ...ghostBtn, alignSelf: "flex-start" }} data-hs-add-item="">
                    <Plus size={16} /> {form.shape === "tile" ? "עוד שני ריבועים (4)" : "הוספת פריט"}
                  </button>
                )}
                {form.shape === "tile" && form.items.length === 4 && (
                  <button type="button" onClick={() => set({ items: form.items.slice(0, 2) })} style={{ ...ghostBtn, alignSelf: "flex-start" }} data-hs-tiles-two="">רק שני ריבועים</button>
                )}
              </section>
            )}

            <section style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-label="למי">
              <span style={sectionTitle}>למי</span>
              <ChipSet label="תפקיד" name="hs-roles" options={STUDIO_ROLES.map((r) => ({ key: r.key, label: r.label }))} value={form.roles} onChange={(roles) => set({ roles })}
                hint="חברת ניהול וספקים לא רואים כרטיסים במסך הבית." />
              {problemAt("roles") && <span style={errText}>{problemAt("roles")}</span>}
              <div className="hs-row">
                <Field label="ערים (לא חובה)" hint="מופרדות בפסיק. ריק — בכל הארץ.">
                  <input value={form.cities} onChange={(e) => set({ cities: e.target.value })} style={inputStyle} placeholder="תל אביב-יפו, חיפה" data-hs-cities="" />
                  {problemAt("cities") && <span style={errText}>{problemAt("cities")}</span>}
                </Field>
                <Field label="משתמשים חדשים (לא חובה)" hint={`רק מי שהצטרף ב-N הימים האחרונים (עד ${LIMITS.newDaysMax}).`}>
                  <input inputMode="numeric" value={form.new_days} onChange={(e) => set({ new_days: e.target.value })} style={inputStyle} placeholder="למשל 14" data-hs-new-days="" />
                  {problemAt("new_days") && <span style={errText}>{problemAt("new_days")}</span>}
                </Field>
              </div>
              <ChipSet label="מסלול הבניין (לא חובה)" name="hs-plans" min={0} allLabel="כל המסלולים" options={STUDIO_PLANS.map((p) => ({ key: p.key, label: p.label }))}
                value={form.plans} onChange={(plans) => set({ plans: plans.length === STUDIO_PLANS.length ? [] : plans })} hint="בלי בחירה — כל המסלולים." />
              <Field label="אחוז מהקהל" hint="פחות מ-100 — לבדוק על חלק קטן קודם. אותו אדם נשאר באותה קבוצה.">
                <input inputMode="numeric" value={form.rollout} onChange={(e) => set({ rollout: e.target.value })} style={{ ...inputStyle, maxWidth: "140px" }} data-hs-rollout="" />
                {problemAt("rollout") && <span style={errText}>{problemAt("rollout")}</span>}
              </Field>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="מתי">
              <span style={sectionTitle}>מתי</span>
              <div className="hs-row">
                <Field label="מהיום (לא חובה)" hint="ריק — מהרגע שמפרסמים.">
                  <input type="date" value={form.start_day} onChange={(e) => set({ start_day: e.target.value })} style={inputStyle} data-hs-start="" />
                </Field>
                <Field label="עד היום (כולל, לא חובה)" hint="ריק — עד שמשהים.">
                  <input type="date" value={form.end_day} onChange={(e) => set({ end_day: e.target.value, ...(e.target.value ? {} : { countdown: false }) })} style={inputStyle} data-hs-end="" />
                </Field>
              </div>
              {problemAt("window") && <span style={errText}>{problemAt("window")}</span>}
              {ended && <span style={{ ...hintText, color: "var(--yellow)" }} data-hs-ended="">תאריך הסיום כבר עבר: אפשר לשמור, אי אפשר לפרסם.</span>}
              <Segmented<CardForm["frequency"]> label="סגירה (X)" testId="hs-frequency" value={form.frequency} onChange={(fq) => set({ frequency: fq })}
                options={[{ key: "until_closed", label: FREQUENCY_LABEL.until_closed }, { key: "daily", label: FREQUENCY_LABEL.daily }]} />
              <span style={hintText}>{form.frequency === "daily" ? "מי שסגר יראה את הכרטיס שוב מחר." : "מי שסגר לא יראה אותו שוב."}</span>
            </section>
          </fieldset>
        </div>

        <div className="hs-editor-phone" data-hs-preview="">
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            <Segmented<320 | 390> label="רוחב הטלפון" testId="hs-width" value={width} onChange={setWidth} options={[{ key: 390, label: "טלפון רגיל" }, { key: 320, label: "טלפון קטן" }]} />
            <Segmented<StudioRole> label="איך זה נראה אצל" testId="hs-role" value={role} onChange={setRole} options={[{ key: "tenant", label: "דייר" }, { key: "vaad", label: "ועד" }]} />
          </div>
          <PhoneFrame width={width} slot={form.slot}
            note={preview.hidden === "audience" ? `${role === "vaad" ? "ועד" : "דיירים"} לא בקהל של הכרטיס, ולכן לא יראו אותו.`
              : preview.hidden === "empty" ? (form.source === "whats_new" ? 'אין עדכון "מה חדש" שפורסם לקהל הזה, ולכן הכרטיס לא יוצג.' : "הוסיפו תמונה או כותרת כדי לראות את הכרטיס.") : null}>
            <PhoneCard card={preview.card} now={now} />
          </PhoneFrame>
          <span style={{ ...hintText, textAlign: "center" }}>עד {STUDIO_CAP} כרטיסים במסך בית אחד, ובזמן חירום פעיל אף אחד.</span>
        </div>
      </div>

      {canManage && !locked && card?.status !== "archived" && ask && (
        <div role="alertdialog" aria-label={ask === "live" ? "לפרסם?" : "לשלוח לבדיקה?"} data-hs-ask={ask}
          style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid rgba(59,130,246,.5)", background: "rgba(59,130,246,.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
          {ask === "live" ? (
            <span style={{ fontSize: "14px", fontWeight: 700 }}>לפרסם עכשיו? הכרטיס יופיע במסך הבית של {form.roles.map((r) => (r === "vaad" ? "הוועד" : "הדיירים")).join(" ושל ")}{form.cities.trim() ? " בערים שנבחרו" : ""}{form.start_day ? ` מ-${form.start_day.split("-").reverse().join("/")}` : ""}.</span>
          ) : (
            <>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>לאיזה חשבון ב-bloc לשלוח? (המייל שאיתו נכנסים לאפליקציה, עד 5)</span>
              <input value={emails} onChange={(e) => setEmails(e.target.value)} dir="ltr" style={inputStyle} data-hs-test-emails="" aria-label="מיילים לבדיקה" />
              <span style={hintText}>הכרטיס יופיע רק בחשבונות האלה (של דייר או ועד), עם התגית &quot;בבדיקה&quot;. אצל כל השאר — כלום.</span>
            </>
          )}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" disabled={!!busy || (ask === "test" && (emailList.length === 0 || emailList.length > LIMITS.testEmails))} data-hs-ask-yes=""
              onClick={() => void moveTo(ask, ask === "test" ? emailList : undefined)} style={solidBtn("var(--blue)")}>
              {ask === "live" ? "כן, לפרסם" : "שליחה לבדיקה"}
            </button>
            <button type="button" onClick={() => setAsk(null)} style={ghostBtn} data-hs-ask-no="">ביטול</button>
          </div>
        </div>
      )}

      {canManage && !locked && (
        <StickyBar testId="hs-editor-actions">
          {card?.status !== "archived" && (
            <button type="button" onClick={() => void save()} disabled={!!busy || uploading || (!!card && !dirty)} style={solidBtn("var(--text)", "var(--bg)")} data-hs-save="">
              {busy === "save" ? "שומרים…" : card?.status === "live" && dirty ? "שמירה (מתעדכן מיד אצל כולם)" : card ? (dirty ? "שמירה" : "נשמר") : "שמירה כטיוטה"}
            </button>
          )}
          {canTest && card?.status !== "live" && (
            <button type="button" onClick={() => { setShown(true); setAsk("test"); }} disabled={!!busy || uploading} style={ghostBtn} data-hs-test=""><Smartphone size={16} /> שליחה לטלפון שלי</button>
          )}
          {canLive && (
            <button type="button" onClick={() => { setShown(true); if (!problems.length) setAsk("live"); else setError({ text: problems[0].text, field: problems[0].field }); }}
              disabled={!!busy || uploading || ended} style={solidBtn("var(--blue)")} data-hs-publish=""><Send size={16} /> {card?.status === "paused" ? "חזרה לפרסום" : "פרסום"}</button>
          )}
          {card && nextStatuses.filter((s) => s === "paused" || s === "draft" || s === "archived").map((s) => (
            <button key={s} type="button" onClick={() => void moveTo(s)} disabled={!!busy || uploading} style={ghostBtn} data-hs-status={s}>
              {s === "paused" ? <Pause size={15} /> : s === "archived" ? <Archive size={15} /> : null} {STATUS_ACTION[s]}
            </button>
          ))}
          {card && card.status !== "archived" && (
            <button type="button" onClick={() => void duplicate()} disabled={!!busy || uploading || dirty} title={dirty ? "שמרו קודם" : undefined} style={ghostBtn} data-hs-duplicate=""><Copy size={15} /> שכפול</button>
          )}
        </StickyBar>
      )}
    </Sheet>
  );
}

function ItemEditor({ item, n, total, shape, canRemove, upload, problem, onChange, onRemove, onMove, onPick }: {
  item: ItemForm; n: number; total: number; shape: StudioShape; canRemove: boolean; upload: UploadState; problem: (field: string) => string | null
  onChange: (p: Partial<ItemForm>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onPick: () => void
}) {
  const img = IMAGE_HINT[shape];
  const box = imageBoxState({ url: item.image_url, upload, refusal: problem("image_url"), base: STUDIO_IMAGE_BASE, hint: img.hint });
  const own = problem("");
  return (
    <div className="card-sm" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }} data-hs-item={item.id} aria-label={`פריט ${n + 1}`}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "14px", fontWeight: 800, flex: 1 }}>פריט {n + 1}</span>
        <button type="button" onClick={() => onMove(-1)} disabled={n === 0} aria-label={`פריט ${n + 1} למעלה`} style={iconBtn}><ArrowUp size={16} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={n === total - 1} aria-label={`פריט ${n + 1} למטה`} style={iconBtn}><ArrowDown size={16} /></button>
        {canRemove && <button type="button" onClick={onRemove} aria-label={`מחיקת פריט ${n + 1}`} style={{ ...iconBtn, color: "var(--red)" }} data-hs-remove-item=""><Trash2 size={16} /></button>}
      </div>
      {own && <span style={errText}>{own}</span>}
      <CreativeImageField url={item.image_url} box={box} locked={false} onPick={onPick} shape={img.shape} />
      {item.image_url && (
        <div className="hs-row">
          <Field label="מה רואים בתמונה (לקוראי מסך, לא חובה)">
            <input value={item.image_alt} onChange={(e) => onChange({ image_alt: e.target.value })} style={inputStyle} data-hs-alt="" />
          </Field>
          <button type="button" onClick={() => onChange({ image_url: "", image_alt: "" })} style={{ ...ghostBtn, alignSelf: "flex-end" }} data-hs-remove-image="">הסרת התמונה</button>
        </div>
      )}
      <div className="hs-row">
        <Field label="כותרת">
          <input value={item.title} onChange={(e) => onChange({ title: e.target.value })} style={inputStyle} data-hs-item-title="" />
          {counter(item.title, LIMITS.itemTitle)}
          {problem("title") && <span style={errText}>{problem("title")}</span>}
        </Field>
        <Field label="תגית (לא חובה)" hint='למשל "חדש".'>
          <input value={item.badge} onChange={(e) => onChange({ badge: e.target.value })} style={inputStyle} data-hs-badge="" />
          {problem("badge") && <span style={errText}>{problem("badge")}</span>}
        </Field>
      </div>
      <Field label="טקסט (לא חובה)">
        <textarea value={item.body} onChange={(e) => onChange({ body: e.target.value })} rows={2} style={{ ...textareaStyle, minHeight: "64px" }} data-hs-body="" />
        {counter(item.body, LIMITS.itemBody)}
        {problem("body") && <span style={errText}>{problem("body")}</span>}
      </Field>
      {!item.image_url && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>אייקון (כשאין תמונה)</span>
          <div role="radiogroup" aria-label="אייקון" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <button type="button" role="radio" aria-checked={item.icon === ""} onClick={() => onChange({ icon: "" })} style={{ ...chipBtn(item.icon === ""), padding: "0 10px" }} data-hs-icon="">בלי</button>
            {STUDIO_ICONS.map((ic) => {
              const Icon = STUDIO_ICON[ic];
              return <button key={ic} type="button" role="radio" aria-checked={item.icon === ic} aria-label={ICON_LABEL[ic]} title={ICON_LABEL[ic]} onClick={() => onChange({ icon: ic })} style={chipBtn(item.icon === ic)} data-hs-icon={ic}><Icon size={18} /></button>;
            })}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>צבע</span>
        <div role="radiogroup" aria-label="צבע" style={{ display: "flex", gap: "6px" }}>
          {STUDIO_ACCENTS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={item.accent === a} aria-label={ACCENT_INFO[a].label} title={ACCENT_INFO[a].label} onClick={() => onChange({ accent: a })} data-hs-accent={a}
              style={{ width: "44px", height: "44px", borderRadius: "12px", border: `2px solid ${item.accent === a ? "var(--text)" : "transparent"}`, background: "transparent", padding: "4px" }}>
              <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "8px", background: ACCENT_INFO[a].light, border: `2px solid ${ACCENT_INFO[a].ink}` }} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>לחיצה על הפריט פותחת (לא חובה)</span>
        <Segmented<LinkKind> label="קישור" testId={`hs-link-${item.id}`} value={item.link_kind} onChange={(k) => onChange({ link_kind: k, ...(k === "none" ? { cta: "" } : {}) })}
          options={[{ key: "none", label: "כלום" }, { key: "route", label: "מסך ב-bloc" }, { key: "url", label: "אתר" }]} />
        {item.link_kind === "route" && (
          <select value={item.route} onChange={(e) => onChange({ route: e.target.value })} style={inputStyle} aria-label="המסך" data-hs-route="">
            {STUDIO_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}
          </select>
        )}
        {item.link_kind === "url" && (
          <input value={item.url} onChange={(e) => onChange({ url: e.target.value })} dir="ltr" placeholder="https://" style={inputStyle} aria-label="הכתובת" data-hs-url="" />
        )}
        {problem("link") && <span style={errText}>{problem("link")}</span>}
        {item.link_kind !== "none" && (
          <Field label="כפתור (לא חובה)" hint="בלי כפתור — לחיצה על הפריט עצמו פותחת. אתר נפתח בלשונית חדשה.">
            <input value={item.cta} onChange={(e) => onChange({ cta: e.target.value })} style={inputStyle} placeholder="למשל: לפרטים" data-hs-cta="" />
            {problem("cta") && <span style={errText}>{problem("cta")}</span>}
          </Field>
        )}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = { width: "44px", height: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)" };
const chipBtn = (on: boolean): React.CSSProperties => ({ minWidth: "44px", height: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", fontFamily: "inherit", fontSize: "13px",
  border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.14)" : "transparent", color: on ? "var(--text)" : "var(--text-2)" });
const EDITOR_CSS = `
.hs-editor-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
.hs-editor-phone { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.hs-shapes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 6px; }
.hs-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 12px; align-items: start; }
@media (min-width: 900px) { .hs-editor-grid { grid-template-columns: minmax(0, 1fr) 430px; } .hs-editor-phone { position: sticky; top: 64px; align-self: start; } }
`;
