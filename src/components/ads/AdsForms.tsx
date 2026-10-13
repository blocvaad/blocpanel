"use client";
// AdsForms — חלונות העריכה של מפרסם ושל חוזה (bloc ADS-1). השמירה דרך /api/ads; שגיאה — המשפט מהשרת.
import { useState } from "react";
import { Modal, Banner, solidBtn, ghostBtn, inputStyle, textareaStyle } from "@/components/ui/panelKit";
import { postAds, Field } from "./adsKit";
import {
  PRICINGS, PRICING_LABEL, PRICING_HINT, CONTRACT_STATUS_LABEL, ilTodayKey, addDaysKey,
  type Pricing, type ContractStatus,
} from "@/lib/ads";
import type { AdAdvertiserRow, AdContractRow } from "@/lib/adsServer";

const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" };

export function AdvertiserModal({ initial, onClose, onSaved }: {
  initial: AdAdvertiserRow | null; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "", legal_name: initial?.legal_name ?? "", business_id: initial?.business_id ?? "",
    contact_name: initial?.contact_name ?? "", contact_phone: initial?.contact_phone ?? "", contact_email: initial?.contact_email ?? "",
    website: initial?.website ?? "", notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true); setErr(null);
    const r = await postAds({ action: "advertiser.save", ...(initial ? { id: initial.id } : {}), ...f });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved(initial ? "המפרסם עודכן." : "המפרסם נוסף.");
  }

  return (
    <Modal title={initial ? "עריכת מפרסם" : "מפרסם חדש"} onClose={onClose} busy={busy} width={640}>
      <div style={row}>
        <Field label="השם שהדיירים רואים" hint="ליד המילה &quot;ממומן&quot;, עד 80 תווים">
          <input value={f.name} onChange={set("name")} maxLength={80} style={inputStyle} data-ad-field="name" />
        </Field>
        <Field label="השם הרשמי (לחוזה)">
          <input value={f.legal_name} onChange={set("legal_name")} maxLength={160} style={inputStyle} data-ad-field="legal_name" />
        </Field>
        <Field label="ח.פ / ע.מ">
          <input value={f.business_id} onChange={set("business_id")} inputMode="numeric" maxLength={20} style={inputStyle} data-ad-field="business_id" />
        </Field>
        <Field label="איש קשר">
          <input value={f.contact_name} onChange={set("contact_name")} maxLength={120} style={inputStyle} />
        </Field>
        <Field label="טלפון">
          <input value={f.contact_phone} onChange={set("contact_phone")} inputMode="tel" maxLength={30} style={inputStyle} dir="ltr" />
        </Field>
        <Field label="אימייל">
          <input value={f.contact_email} onChange={set("contact_email")} type="email" maxLength={200} style={inputStyle} dir="ltr" />
        </Field>
        <Field label="אתר" style={{ gridColumn: "1 / -1" }}>
          <input value={f.website} onChange={set("website")} placeholder="https://" maxLength={500} style={inputStyle} dir="ltr" />
        </Field>
        <Field label="הערות פנימיות" style={{ gridColumn: "1 / -1" }}>
          <textarea value={f.notes} onChange={set("notes")} maxLength={2000} style={textareaStyle} />
        </Field>
      </div>
      {err && <Banner tone="error">{err}</Banner>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-start" }}>
        <button type="button" onClick={() => void save()} disabled={busy || f.name.trim().length < 2} style={{ ...solidBtn("var(--blue)"), opacity: busy || f.name.trim().length < 2 ? 0.6 : 1 }} data-ad-save="advertiser">
          {busy ? "שומרים…" : "שמירה"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>ביטול</button>
      </div>
    </Modal>
  );
}

export function ContractModal({ advertiser, initial, onClose, onSaved }: {
  advertiser: { id: string; name: string }; initial: AdContractRow | null; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const today = ilTodayKey();
  const locked = !!initial && initial.views + initial.clicks > 0;
  const [f, setF] = useState({
    reference: initial?.reference ?? "", pricing: (initial?.pricing ?? "cpm") as Pricing, price: String(initial?.price_ils ?? ""),
    cap: initial?.impression_cap != null ? String(initial.impression_cap) : "", starts_on: initial?.starts_on ?? today,
    ends_on: initial?.ends_on ?? addDaysKey(today, 30), status: (initial?.status ?? "draft") as ContractStatus,
    document_url: initial?.document_url ?? "", notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true); setErr(null);
    const price = Number(f.price.replace(/[,\s₪]/g, ""));
    const cap = f.cap.trim() ? Number(f.cap.replace(/[,\s]/g, "")) : null;
    const r = await postAds({
      action: "contract.save", ...(initial ? { id: initial.id } : {}), advertiser_id: advertiser.id,
      reference: f.reference, pricing: f.pricing, price_ils: Number.isFinite(price) ? price : -1,
      impression_cap: cap, starts_on: f.starts_on, ends_on: f.ends_on, status: f.status,
      document_url: f.document_url, notes: f.notes,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved(initial ? "החוזה עודכן." : "החוזה נוסף.");
  }

  return (
    <Modal title={initial ? `עריכת חוזה: ${advertiser.name}` : `חוזה חדש: ${advertiser.name}`} onClose={onClose} busy={busy} width={680}>
      {locked && (
        <Banner tone="info">בחוזה הזה כבר הוצגו פרסומות, ולכן מודל התמחור והמחיר קבועים. אפשר לשנות תאריכים, תקרה, מצב ומסמך.</Banner>
      )}
      <div role="radiogroup" aria-label="מודל תמחור" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "8px" }}>
        {PRICINGS.map((p) => {
          const on = f.pricing === p;
          return (
            <button key={p} type="button" role="radio" aria-checked={on} disabled={locked} data-pricing={p}
              onClick={() => setF((x) => ({ ...x, pricing: p }))}
              style={{ minHeight: "60px", padding: "10px 12px", borderRadius: "10px", textAlign: "right", color: "var(--text)", opacity: locked && !on ? 0.5 : 1,
                border: `2px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "#3b82f61f" : "transparent" }}>
              <span style={{ display: "block", fontSize: "15px", fontWeight: 700 }}>{PRICING_LABEL[p]}</span>
              <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)", marginTop: "2px" }}>{PRICING_HINT[p]}</span>
            </button>
          );
        })}
      </div>
      <div style={row}>
        <Field label={f.pricing === "flat" ? "הסכום (₪)" : f.pricing === "cpm" ? "מחיר לאלף חשיפות (₪)" : "מחיר להקלקה (₪)"}>
          <input value={f.price} onChange={set("price")} inputMode="decimal" disabled={locked} style={inputStyle} data-ad-field="price" dir="ltr" />
        </Field>
        <Field label="תקרת חשיפות לחוזה" hint="ריק — בלי תקרה. נספרות חשיפות שנראו, בכל הקמפיינים של החוזה.">
          <input value={f.cap} onChange={set("cap")} inputMode="numeric" style={inputStyle} data-ad-field="cap" dir="ltr" />
        </Field>
        <Field label="מתאריך">
          <input type="date" value={f.starts_on} onChange={set("starts_on")} className="input" data-ad-field="starts_on" />
        </Field>
        <Field label="עד תאריך (כולל)">
          <input type="date" value={f.ends_on} min={f.starts_on} onChange={set("ends_on")} className="input" data-ad-field="ends_on" />
        </Field>
        <Field label="מצב">
          <select value={f.status} onChange={set("status")} style={inputStyle} data-ad-field="status">
            {(["draft", "active", "cancelled"] as ContractStatus[]).map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="מספר חוזה / הזמנה">
          <input value={f.reference} onChange={set("reference")} maxLength={60} style={inputStyle} />
        </Field>
        <Field label="קישור למסמך החוזה" style={{ gridColumn: "1 / -1" }}>
          <input value={f.document_url} onChange={set("document_url")} placeholder="https://" maxLength={1000} style={inputStyle} dir="ltr" />
        </Field>
        <Field label="הערות" style={{ gridColumn: "1 / -1" }}>
          <textarea value={f.notes} onChange={set("notes")} maxLength={2000} style={textareaStyle} />
        </Field>
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
        רק חוזה במצב &quot;פעיל&quot; ובתוך התאריכים שלו מאפשר להציג פרסומות. ביטול — עוצר מיד את כל הקמפיינים שלו.
      </p>
      {err && <Banner tone="error">{err}</Banner>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => void save()} disabled={busy || !f.price.trim()} style={{ ...solidBtn("var(--blue)"), opacity: busy || !f.price.trim() ? 0.6 : 1 }} data-ad-save="contract">
          {busy ? "שומרים…" : "שמירה"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>ביטול</button>
      </div>
    </Modal>
  );
}
