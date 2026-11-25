"use client";
// homeStudio/UpdatesPanel — "מה חדש ב-bloc" (bloc HOME-STUDIO-1, החלטה 684): העדכונים שכרטיס "מה חדש" מציג — כותרת, משפט, תמונה וקישור
// (לא חובה), ולמי (דיירים / ועד). טיוטה → פורסם (הזמן נקבע בפרסום הראשון, ולכן עדכון שחזר לטיוטה ופורסם שוב לא מוצג שוב למי שכבר
// ראה) → ארכיון. כל משתמש רואה בכרטיס רק עדכונים שעוד לא ראה; בלי עדכון חדש — הכרטיס לא מוצג.
import { useRef, useState } from "react";
import { Plus, Send, Archive, RefreshCw } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn, inputStyle, textareaStyle } from "@/components/ui/panelKit";
import { ChipSet, Field } from "@/components/ads/adsKit";
import { Segmented, Sheet, StickyBar, STUDIO_CSS, STUDIO_IMAGE_BASE } from "@/components/ads/studio/kit";
import CreativeImageField from "@/components/ads/CreativeImageField";
import { imageBoxState, type UploadState } from "@/lib/adsUi";
import { AD_IMAGE_MAX_BYTES } from "@/lib/ads";
import { ilDate } from "@/lib/committee";
import {
  LIMITS, STUDIO_ROLES, STUDIO_ROUTES, UPDATE_STATUS_LABEL, UPDATE_TRANSITIONS, emptyUpdateForm, linkFromText, linkText, parseUpdate,
  updateAsItem, updateFormOf, updatePayload, updateProblems,
  type LinkKind, type StudioUpdate, type UpdateForm, type UpdateStatus,
} from "@/lib/homeStudio";
import { PhoneCard } from "./StudioPhone";
import { postStudio, uploadStudioImage, hintText, errText } from "./hsKit";

const TONE: Record<UpdateStatus, "ok" | "muted"> = { draft: "muted", live: "ok", archived: "muted" };

export function UpdateRow({ u, onOpen }: { u: StudioUpdate; onOpen: () => void }) {
  const l = linkFromText(u.link);
  return (
    <button type="button" onClick={onOpen} className="card-sm" data-hs-update={u.id}
      style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 14px", textAlign: "start", fontFamily: "inherit", color: "var(--text)", width: "100%" }}>
      <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, flex: "1 1 auto", minWidth: 0 }}>{u.title}</span>
        <Tag tone={TONE[u.status]}>{UPDATE_STATUS_LABEL[u.status]}</Tag>
      </span>
      <span style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.5 }}>{u.body}</span>
      <span style={hintText}>
        {u.roles.map((r) => (r === "vaad" ? "ועד" : "דיירים")).join(" ו")}
        {u.published_at ? ` · פורסם ב-${ilDate(u.published_at)}` : ""}
        {l ? ` · ${linkText(l)}` : ""}
      </span>
    </button>
  );
}

export function UpdateEditor({ update, canManage, onClose, onChanged, onRefresh }: {
  update: StudioUpdate | null; canManage: boolean; onClose: () => void; onChanged: (u: StudioUpdate, note: string) => void; onRefresh: () => void
}) {
  const [cur, setCur] = useState<StudioUpdate | null>(update);
  const [form, setForm] = useState<UpdateForm>(update ? updateFormOf(update) : emptyUpdateForm());
  const [saved, setSaved] = useState<string>(JSON.stringify(updatePayload(update ? updateFormOf(update) : emptyUpdateForm())));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [locked, setLocked] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const file = useRef<HTMLInputElement | null>(null);
  const dirty = !cur || JSON.stringify(updatePayload(form)) !== saved;
  const problems = updateProblems(form, STUDIO_IMAGE_BASE);
  const at = (f: string) => (shown ? problems.find((p) => p.field === f)?.text ?? null : null);
  const readOnly = !canManage || cur?.status === "archived" || locked;
  const set = (p: Partial<UpdateForm>) => { setForm((f) => ({ ...f, ...p })); setNote(null); };

  function done(u: StudioUpdate, text: string) {
    const f = updateFormOf(u);
    setCur(u); setForm(f); setSaved(JSON.stringify(updatePayload(f))); setNote(text); onChanged(u, text);
  }
  async function save(): Promise<StudioUpdate | null> {
    if (cur && !dirty) return cur;
    setShown(true);
    if (problems.length) { setError(problems[0].text); return null; }
    setBusy("save"); setError(null);
    const r = await postStudio<{ update: unknown }>({ action: "update.save", ...updatePayload(form) });
    setBusy(null);
    if (!r.ok) { setError(r.error); if (!cur && r.unclear) setLocked(true); return null; }
    const u = parseUpdate(r.data.update);
    if (!u) { setError("התשובה לא ברורה. רעננו את הדף לפני שמנסים שוב."); if (!cur) setLocked(true); return null; }
    done(u, cur ? (u.status === "live" ? "נשמר, ומתעדכן עכשיו בכרטיסים." : "נשמר.") : "נשמר כטיוטה.");
    return u;
  }
  async function moveTo(status: UpdateStatus) {
    const u = status === "live" ? await save() : cur;
    if (!u) return;
    setBusy(status); setError(null);
    const r = await postStudio<{ update: unknown }>({ action: "update.status", id: u.id, version: u.version, status });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    const n = parseUpdate(r.data.update);
    if (!n) { setError("התשובה לא ברורה. רעננו את הדף לפני שמנסים שוב."); return; }
    done(n, status === "live" ? "פורסם. מי שעוד לא ראה אותו יראה אותו בכרטיס \"מה חדש\"." : status === "archived" ? "הועבר לארכיון." : "חזר לטיוטה.");
  }
  async function onFile(f: File | null) {
    if (!f) return;
    if (f.size > AD_IMAGE_MAX_BYTES) { setUpload({ phase: "failed", error: "התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב." }); return; }
    setUpload({ phase: "uploading", name: f.name });
    const r = await uploadStudioImage(f);
    if (!r.ok) { setUpload({ phase: "failed", error: r.error }); return; }
    setUpload({ phase: "done", name: f.name });
    set({ image_url: r.url });
  }
  const box = imageBoxState({ url: form.image_url, upload, refusal: at("image_url"), base: STUDIO_IMAGE_BASE, hint: "JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1600×900⁩ (16:9)." });
  const next = cur ? UPDATE_TRANSITIONS[cur.status] : (["live"] as UpdateStatus[]);
  const previewItem = updateAsItem({ id: cur?.id ?? "00000000-0000-4000-8000-000000000000", title: form.title.trim() || "הכותרת של העדכון", body: form.body.trim() || "משפט או שניים: מה חדש ולמה זה טוב.",
    image_url: form.image_url.trim() || null, link: form.link_kind === "route" ? form.route : form.link_kind === "url" ? form.url.trim() : null });

  return (
    <Sheet title={cur ? `עדכון: ${cur.title}` : 'עדכון חדש ב"מה חדש ב-bloc"'} onClose={onClose} busy={!!busy || upload.phase === "uploading"} testId="hs-update-editor"
      guard={dirty && !readOnly && (cur || form.title.trim() || form.body.trim()) ? "יש שינויים שלא נשמרו. לסגור בלי לשמור?" : null}>
      <style>{STUDIO_CSS}</style>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {cur && <div><Tag tone={TONE[cur.status]}>{UPDATE_STATUS_LABEL[cur.status]}</Tag></div>}
      {locked && <Banner tone="warn" action={<button type="button" style={ghostBtn} onClick={onRefresh}><RefreshCw size={15} /> רענון</button>}>לא ברור אם העדכון נשמר. רעננו ובדקו לפני שמנסים שוב.</Banner>}
      {error && !locked && <Banner tone="error">{error}</Banner>}
      {note && !error && <Banner tone="ok">{note}</Banner>}
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        <Field label="כותרת">
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} data-hs-update-title="" />
          <span style={hintText}>{form.title.trim().length}/{LIMITS.updateTitle}</span>
          {at("title") && <span style={errText}>{at("title")}</span>}
        </Field>
        <Field label="מה חדש ולמה זה טוב">
          <textarea value={form.body} onChange={(e) => set({ body: e.target.value })} rows={3} style={textareaStyle} data-hs-update-body="" />
          <span style={hintText}>{form.body.trim().length}/{LIMITS.updateBody}</span>
          {at("body") && <span style={errText}>{at("body")}</span>}
        </Field>
        <CreativeImageField url={form.image_url} box={box} locked={false} onPick={() => file.current?.click()} shape={{ w: 80, h: 45, label: "16:9" }} />
        {form.image_url && <button type="button" onClick={() => set({ image_url: "" })} style={{ ...ghostBtn, alignSelf: "flex-start" }}>הסרת התמונה</button>}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>קישור (לא חובה): הכפתור &quot;לנסות עכשיו&quot;</span>
          <Segmented<LinkKind> label="קישור" testId="hs-update-link" value={form.link_kind} onChange={(k) => set({ link_kind: k })}
            options={[{ key: "none", label: "בלי" }, { key: "route", label: "מסך ב-bloc" }, { key: "url", label: "אתר" }]} />
          {form.link_kind === "route" && (
            <select value={form.route} onChange={(e) => set({ route: e.target.value })} style={inputStyle} aria-label="המסך">
              {STUDIO_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}
            </select>
          )}
          {form.link_kind === "url" && <input value={form.url} onChange={(e) => set({ url: e.target.value })} dir="ltr" placeholder="https://" style={inputStyle} aria-label="הכתובת" />}
          {at("link") && <span style={errText}>{at("link")}</span>}
        </div>
        <ChipSet label="למי" name="hs-update-roles" options={STUDIO_ROLES.map((r) => ({ key: r.key, label: r.label }))} value={form.roles} onChange={(roles) => set({ roles })} />
        {at("roles") && <span style={errText}>{at("roles")}</span>}
      </fieldset>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>ככה זה ייראה בכרטיס &quot;מה חדש&quot;</span>
        <div dir="rtl" style={{ background: "#F0F4F8", borderRadius: "16px", padding: "14px", maxWidth: "390px" }} data-hs-update-preview="">
          <PhoneCard card={{ shape: "deck", source: "whats_new", title: "מה חדש ב-bloc", subtitle: null, style: "soft", items: [previewItem], dismiss: "until_closed", test: false, countdown_to: null }} now={new Date()} />
        </div>
      </div>
      {canManage && !locked && cur?.status !== "archived" && (
        <StickyBar testId="hs-update-actions">
          <button type="button" onClick={() => void save()} disabled={!!busy || (!!cur && !dirty)} style={solidBtn("var(--text)", "var(--bg)")} data-hs-update-save="">
            {busy === "save" ? "שומרים…" : cur ? (dirty ? "שמירה" : "נשמר") : "שמירה כטיוטה"}
          </button>
          {next.includes("live") && <button type="button" onClick={() => void moveTo("live")} disabled={!!busy} style={solidBtn("var(--blue)")} data-hs-update-publish=""><Send size={16} /> פרסום</button>}
          {cur && next.includes("draft") && <button type="button" onClick={() => void moveTo("draft")} disabled={!!busy} style={ghostBtn} data-hs-update-draft="">החזרה לטיוטה</button>}
          {cur && next.includes("archived") && <button type="button" onClick={() => void moveTo("archived")} disabled={!!busy} style={ghostBtn} data-hs-update-archive=""><Archive size={15} /> לארכיון</button>}
        </StickyBar>
      )}
      {canManage && cur?.status === "archived" && (
        <button type="button" onClick={() => void moveTo("draft")} disabled={!!busy} style={{ ...ghostBtn, alignSelf: "flex-start" }} data-hs-update-restore="">החזרה לטיוטה</button>
      )}
    </Sheet>
  );
}

export default function UpdatesPanel({ updates, canManage, onChanged, onRefresh }: {
  updates: StudioUpdate[]; canManage: boolean; onChanged: (u: StudioUpdate, note: string) => void; onRefresh: () => void
}) {
  const [open, setOpen] = useState<StudioUpdate | "new" | null>(null);
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const list = updates.filter((u) => (filter === "archived" ? u.status === "archived" : u.status !== "archived"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-hs-updates="">
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
        העדכונים כאן מופיעים בכרטיס מסוג &quot;מה חדש ב-bloc&quot;: כל אחד רואה רק מה שעוד לא ראה, ובלי עדכון חדש הכרטיס לא מוצג. כדי שהעדכונים יופיעו, צריך כרטיס כזה מפורסם (תבנית &quot;מה חדש ב-bloc&quot;).
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {canManage && <button type="button" onClick={() => setOpen("new")} style={solidBtn("var(--blue)")} data-hs-new-update=""><Plus size={16} /> עדכון חדש</button>}
        <Segmented<"active" | "archived"> label="אילו עדכונים" testId="hs-updates-filter" value={filter} onChange={setFilter} options={[{ key: "active", label: "פעילים וטיוטות" }, { key: "archived", label: "בארכיון" }]} />
      </div>
      {list.length === 0
        ? <div className="card-sm" style={{ padding: "18px", textAlign: "center", fontSize: "14px", color: "var(--text-2)" }} data-hs-updates-empty="">{filter === "archived" ? "אין עדכונים בארכיון." : "עוד אין עדכונים."}</div>
        : list.map((u) => <UpdateRow key={u.id} u={u} onOpen={() => setOpen(u)} />)}
      {open && (
        <UpdateEditor update={open === "new" ? null : open} canManage={canManage} onClose={() => setOpen(null)} onRefresh={() => { setOpen(null); onRefresh(); }}
          onChanged={onChanged} />
      )}
    </div>
  );
}
