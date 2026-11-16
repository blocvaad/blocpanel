"use client";
// studio/AdvertiserForms — מפרסם וחוזה (bloc ADS-1; ADS-2א v2, החלטה 7 בתוכנית): הטפסים של הסטודיו — באשף (יצירה מהירה) ובדף
// המפרסם (הכל). מפרסם: שם, אתר, לוגו (רק דרך כפתור ההעלאה — bloc מקבל רק את הבאקט שלו; לוגו מאתר אחר — image_not_ours, field
// 'logo_url') וצבע מותג (ברירת המחדל לצבע הכפתור); בטופס המלא — גם הפרטים לחוזה. advertiser.save מחליף את כל השדות, ולכן נשלחים
// תמיד כולם (גם מה שלא מוצג בטופס המהיר). חוזה: תמחור, מחיר, תאריכים, מצב, תקרה, מסמך.
// PANEL-PAY א2ב: השמירה רצה ב-bloc. תשובה לא ברורה ליצירה (ייתכן שנוצר) — "שמירה" נעולה, ובמקומה "סגירה ורענון" (בלי כפילות).
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Banner, solidBtn, ghostBtn, inputStyle, textareaStyle } from "@/components/ui/panelKit";
import { postAds, uploadAdImage, Field } from "../adsKit";
import { lockedAfter, RECHECK_TEXT, isOurAdImage } from "@/lib/adsUi";
import {
  PRICINGS, PRICING_LABEL, PRICING_HINT, CONTRACT_STATUS_LABEL, AD_IMAGE_MAX_BYTES, ilTodayKey, addDaysKey,
  type Pricing, type ContractStatus,
} from "@/lib/ads";
import { isHexColor } from "@/lib/adsFormats";
import { longAdvertiserName, longAdvertiserText } from "@/lib/adsStudio";
import type { AdAdvertiserRow, AdContractRow } from "@/lib/adsServer";
import { AdvertiserAvatar, STUDIO_IMAGE_BASE } from "./kit";

const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))", gap: "12px" };
const BRAND_PRESETS = ["#2563EB", "#16A34A", "#DC2626", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#0F172A"];

/** advertiser.save — כל השדות, תמיד (השמירה מחליפה את כולם). */
export function advertiserPayload(id: string | null, f: Record<string, string>): Record<string, unknown> {
  return {
    action: "advertiser.save", ...(id ? { id } : {}),
    name: f.name ?? "", legal_name: f.legal_name ?? "", business_id: f.business_id ?? "", contact_name: f.contact_name ?? "",
    contact_phone: f.contact_phone ?? "", contact_email: f.contact_email ?? "", website: f.website ?? "", notes: f.notes ?? "",
    logo_url: f.logo_url ?? "", brand_color: isHexColor(f.brand_color) ? f.brand_color.toUpperCase() : "",
  };
}
const fieldsOf = (a: AdAdvertiserRow | null): Record<string, string> => ({
  name: a?.name ?? "", legal_name: a?.legal_name ?? "", business_id: a?.business_id ?? "", contact_name: a?.contact_name ?? "",
  contact_phone: a?.contact_phone ?? "", contact_email: a?.contact_email ?? "", website: a?.website ?? "", notes: a?.notes ?? "",
  logo_url: a?.logo_url ?? "", brand_color: a?.brand_color ?? "",
});

export function AdvertiserForm({ initial, compact = false, onSaved, onCancel, imageBase = STUDIO_IMAGE_BASE }: {
  initial: AdAdvertiserRow | null; compact?: boolean; onSaved: (msg: string, id?: string, name?: string) => void; onCancel: () => void; imageBase?: string | null;
}) {
  const [f, setF] = useState<Record<string, string>>(() => fieldsOf(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "failed">("idle");
  const [logoRefusal, setLogoRefusal] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const logoForeign = !!f.logo_url && isOurAdImage(f.logo_url, imageBase) === false;

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoRefusal(null); setErr(null);
    if (file.size > AD_IMAGE_MAX_BYTES) { setLogoState("failed"); setLogoRefusal("הקובץ גדול מ-2MB. הקטינו אותו ונסו שוב."); return; }
    setLogoState("uploading");
    const r = await uploadAdImage(file);
    if (!r.ok) { setLogoState("failed"); setLogoRefusal(r.error); return; }
    setF((p) => ({ ...p, logo_url: r.url }));
    setLogoState("idle");
  }

  async function save() {
    setBusy(true); setErr(null); setLogoRefusal(null);
    const r = await postAds<{ id: string }>(advertiserPayload(initial?.id ?? null, f));
    setBusy(false);
    if (!r.ok) {
      if (r.code === "image_not_ours") { setLogoRefusal(r.error); return; }
      setErr(r.error); if (lockedAfter(r, !initial)) setStale(true); return;
    }
    onSaved(initial ? "המפרסם עודכן." : "המפרסם נוסף.", r.data.id ?? initial?.id, f.name.trim());
  }

  const ok = f.name.trim().length >= 2 && logoState !== "uploading";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-advertiser-form={compact ? "compact" : "full"}>
      <div style={row}>
        <Field label="השם שהדיירים רואים" hint="ליד המילה &quot;ממומן&quot;, עד 80 תווים">
          <input value={f.name} onChange={set("name")} maxLength={80} style={inputStyle} data-ad-field="name" />
          {longAdvertiserName(f.name) && <span style={{ fontSize: "12.5px", color: "var(--yellow)", lineHeight: 1.5 }} data-advertiser-long-name="">{longAdvertiserText(f.name)}</span>}
        </Field>
        <Field label="אתר">
          <input value={f.website} onChange={set("website")} placeholder="https://" maxLength={500} style={inputStyle} dir="ltr" inputMode="url" data-ad-field="website" />
        </Field>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-advertiser-brand="">
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>המותג — הלוגו ליד &quot;ממומן&quot; (בפס, בכרטיס ברשימה ובחלון), והצבע — ברירת המחדל לכפתור</span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <AdvertiserAvatar name={f.name || "?"} logo={logoForeign ? null : f.logo_url || null} color={f.brand_color || null} size={56} imageBase={imageBase} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} data-logo-file=""
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" style={ghostBtn} disabled={busy || logoState === "uploading"} onClick={() => fileRef.current?.click()} data-logo-upload="">
            <Upload size={15} />{logoState === "uploading" ? "מעלים…" : f.logo_url ? "החלפת הלוגו" : "העלאת לוגו"}
          </button>
          {f.logo_url && <button type="button" style={ghostBtn} disabled={busy} onClick={() => setF((p) => ({ ...p, logo_url: "" }))} data-logo-remove="">הסרה</button>}
        </div>
        {logoForeign && <span style={{ fontSize: "13px", color: "var(--yellow)" }} data-logo-foreign="">הלוגו הזה מאתר אחר, ולכן הוא לא מוצג לדיירים. העלו אותו בכפתור ההעלאה.</span>}
        {logoRefusal && <span role="alert" style={{ fontSize: "13px", color: "var(--red)" }} data-logo-refusal="">{logoRefusal}</span>}
        <div role="radiogroup" aria-label="צבע המותג" style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" role="radio" aria-checked={!f.brand_color} onClick={() => setF((p) => ({ ...p, brand_color: "" }))} data-brand-color="none"
            style={{ minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: `2px solid ${!f.brand_color ? "var(--text)" : "var(--border)"}`, background: "transparent", color: "var(--text-2)", fontSize: "13px", fontFamily: "inherit" }}>
            בלי
          </button>
          {BRAND_PRESETS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={f.brand_color.toUpperCase() === c} aria-label={c} onClick={() => setF((p) => ({ ...p, brand_color: c }))} data-brand-color={c}
              style={{ width: "44px", height: "44px", borderRadius: "12px", border: `2px solid ${f.brand_color.toUpperCase() === c ? "var(--text)" : "transparent"}`, padding: "4px", background: "transparent" }}>
              <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "8px", background: c }} />
            </button>
          ))}
          <label style={{ position: "relative", width: "44px", height: "44px", borderRadius: "12px", border: "2px dashed var(--border-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxSizing: "border-box" }} title="צבע אחר">
            <span aria-hidden="true" style={{ color: "var(--text-2)", fontSize: "18px" }}>+</span>
            <input type="color" aria-label="צבע מותג אחר" value={(isHexColor(f.brand_color) ? f.brand_color : "#2563EB").toLowerCase()} data-brand-custom=""
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, brand_color: e.target.value.toUpperCase() }))}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%" }} />
          </label>
          {f.brand_color && <span className="studio-num" style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--mono)" }} dir="ltr">{f.brand_color.toUpperCase()}</span>}
        </div>
      </div>
      {!compact && (
        <div style={row}>
          <Field label="השם הרשמי (לחוזה)"><input value={f.legal_name} onChange={set("legal_name")} maxLength={160} style={inputStyle} data-ad-field="legal_name" /></Field>
          <Field label="ח.פ / ע.מ"><input value={f.business_id} onChange={set("business_id")} inputMode="numeric" maxLength={20} style={inputStyle} data-ad-field="business_id" /></Field>
          <Field label="איש קשר"><input value={f.contact_name} onChange={set("contact_name")} maxLength={120} style={inputStyle} /></Field>
          <Field label="טלפון"><input value={f.contact_phone} onChange={set("contact_phone")} inputMode="tel" maxLength={30} style={inputStyle} dir="ltr" /></Field>
          <Field label="אימייל"><input value={f.contact_email} onChange={set("contact_email")} type="email" maxLength={200} style={inputStyle} dir="ltr" /></Field>
          <Field label="הערות פנימיות" style={{ gridColumn: "1 / -1" }}><textarea value={f.notes} onChange={set("notes")} maxLength={2000} style={textareaStyle} /></Field>
        </div>
      )}
      {err && <Banner tone="error" action={stale ? <RecheckButton onClick={() => onSaved(RECHECK_TEXT.advertiser)} /> : undefined}><span data-advertiser-error="">{err}</span></Banner>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => void save()} disabled={busy || stale || !ok} style={{ ...solidBtn("var(--blue)"), opacity: busy || stale || !ok ? 0.6 : 1 }} data-ad-save="advertiser">
          {busy ? "שומרים…" : initial ? "שמירה" : "הוספת המפרסם"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn}>ביטול</button>
      </div>
    </div>
  );
}

export function ContractForm({ advertiser, initial, defaults, onSaved, onCancel }: {
  advertiser: { id: string; name: string }; initial: AdContractRow | null;
  /** חוזה חדש מהאשף: התאריכים של הקמפיין, ומצב "פעיל". */
  defaults?: { starts_on?: string; ends_on?: string; status?: ContractStatus };
  onSaved: (msg: string, id?: string) => void; onCancel: () => void;
}) {
  const today = ilTodayKey();
  const locked = !!initial && initial.views + initial.clicks > 0;
  const [f, setF] = useState({
    reference: initial?.reference ?? "", pricing: (initial?.pricing ?? "cpm") as Pricing, price: String(initial?.price_ils ?? ""),
    cap: initial?.impression_cap != null ? String(initial.impression_cap) : "", starts_on: initial?.starts_on ?? defaults?.starts_on ?? today,
    ends_on: initial?.ends_on ?? defaults?.ends_on ?? addDaysKey(today, 30), status: (initial?.status ?? defaults?.status ?? "draft") as ContractStatus,
    document_url: initial?.document_url ?? "", notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true); setErr(null);
    const price = Number(f.price.replace(/[,\s₪]/g, ""));
    const cap = f.cap.trim() ? Number(f.cap.replace(/[,\s]/g, "")) : null;
    const r = await postAds<{ id: string }>({
      action: "contract.save", ...(initial ? { id: initial.id } : {}), advertiser_id: advertiser.id,
      reference: f.reference, pricing: f.pricing, price_ils: Number.isFinite(price) ? price : -1,
      impression_cap: cap, starts_on: f.starts_on, ends_on: f.ends_on, status: f.status,
      document_url: f.document_url, notes: f.notes,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); if (lockedAfter(r, !initial)) setStale(true); return; }
    onSaved(initial ? "החוזה עודכן." : "החוזה נוסף.", r.data.id ?? initial?.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-contract-form={initial ? "edit" : "new"}>
      {locked && <Banner tone="info">בחוזה הזה כבר הוצגו פרסומות, ולכן מודל התמחור והמחיר קבועים. אפשר לשנות תאריכים, תקרה, מצב ומסמך.</Banner>}
      <div role="radiogroup" aria-label="מודל תמחור" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "8px" }}>
        {PRICINGS.map((p) => {
          const on = f.pricing === p;
          return (
            <button key={p} type="button" role="radio" aria-checked={on} disabled={locked} data-pricing={p} onClick={() => setF((x) => ({ ...x, pricing: p }))}
              style={{ minHeight: "60px", padding: "10px 12px", borderRadius: "12px", textAlign: "right", color: "var(--text)", opacity: locked && !on ? 0.5 : 1, fontFamily: "inherit",
                border: `2px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "#3b82f61f" : "transparent" }}>
              <span style={{ display: "block", fontSize: "15px", fontWeight: 700 }}>{PRICING_LABEL[p]}</span>
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--text-2)", marginTop: "2px" }}>{PRICING_HINT[p]}</span>
            </button>
          );
        })}
      </div>
      <div style={row}>
        <Field label={f.pricing === "flat" ? "הסכום (₪)" : f.pricing === "cpm" ? "מחיר לאלף חשיפות (₪)" : "מחיר להקלקה (₪)"}>
          <input value={f.price} onChange={set("price")} inputMode="decimal" disabled={locked} style={inputStyle} data-ad-field="price" dir="ltr" />
        </Field>
        <Field label="מצב">
          <select value={f.status} onChange={set("status")} style={inputStyle} data-ad-field="status">
            {(["draft", "active", "cancelled"] as ContractStatus[]).map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="מתאריך"><input type="date" value={f.starts_on} onChange={set("starts_on")} className="input" data-ad-field="starts_on" /></Field>
        <Field label="עד תאריך (כולל)"><input type="date" value={f.ends_on} min={f.starts_on} onChange={set("ends_on")} className="input" data-ad-field="ends_on" /></Field>
        <Field label="תקרת חשיפות לחוזה" hint="ריק — בלי תקרה. נספרות חשיפות שנראו, בכל הקמפיינים של החוזה.">
          <input value={f.cap} onChange={set("cap")} inputMode="numeric" style={inputStyle} data-ad-field="cap" dir="ltr" />
        </Field>
        <Field label="מספר חוזה / הזמנה"><input value={f.reference} onChange={set("reference")} maxLength={60} style={inputStyle} data-ad-field="reference" /></Field>
        <Field label="קישור למסמך החוזה" style={{ gridColumn: "1 / -1" }}>
          <input value={f.document_url} onChange={set("document_url")} placeholder="https://" maxLength={1000} style={inputStyle} dir="ltr" />
        </Field>
        <Field label="הערות" style={{ gridColumn: "1 / -1" }}><textarea value={f.notes} onChange={set("notes")} maxLength={2000} style={textareaStyle} /></Field>
      </div>
      <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>רק חוזה במצב &quot;פעיל&quot; ובתוך התאריכים שלו מאפשר להציג פרסומות. ביטול — עוצר מיד את כל הקמפיינים שלו.</p>
      {err && <Banner tone="error" action={stale ? <RecheckButton onClick={() => onSaved(RECHECK_TEXT.contract)} /> : undefined}><span data-contract-error="">{err}</span></Banner>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => void save()} disabled={busy || stale || !f.price.trim()} style={{ ...solidBtn("var(--blue)"), opacity: busy || stale || !f.price.trim() ? 0.6 : 1 }} data-ad-save="contract">
          {busy ? "שומרים…" : initial ? "שמירה" : "הוספת החוזה"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn}>ביטול</button>
      </div>
    </div>
  );
}

/** אחרי תשובה לא ברורה ליצירה: סוגר ומרענן (onSaved עם ההודעה "בדקו אם נוסף"). */
export function RecheckButton({ onClick }: { onClick: () => void }) {
  return <button type="button" style={ghostBtn} onClick={onClick} data-ad-recheck="">סגירה ורענון</button>;
}
