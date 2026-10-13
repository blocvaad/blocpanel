"use client";
// חלונות הפעולה על אדם (bloc UI-R5c-1): דחייה, הסרה מבניין, ועד, דירה וקומה, מעבר לבניין, חסימה וביטולה.
// כל פעולה שמוציאה מישהו או משנה סמכות — עם תיעוד (מה אומת ואיך); הסרה וחסימה — גם עם אישור מפורש.
// הבקשה הולכת ל-/api/members (→ bloc). שגיאה — בתוך החלון, בעברית; הצלחה — onDone עם התשובה.
import { useState } from "react";
import { Modal, Banner, ghostBtn, solidBtn, fieldLabel, inputStyle, textareaStyle, postMember } from "./panelKit";
import { Toggle } from "./broadcastKit";

type Done = (data: Record<string, unknown>) => void;

function NoteField({ value, onChange, required, label }: { value: string; onChange: (v: string) => void; required: boolean; label?: string }) {
  return (
    <label style={fieldLabel}>
      <span>{label ?? (required ? "תיעוד: מה אומת ואיך (חובה)" : "תיעוד (לא חובה)")}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={1000} style={textareaStyle} data-member-note=""
        placeholder="למשל: אומת בטלפון מול ראש הוועד" />
    </label>
  );
}

function Confirm({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", minHeight: "44px", fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-member-confirm=""
        style={{ width: "20px", height: "20px", marginTop: "3px", flexShrink: 0 }} />
      <span>{label}</span>
    </label>
  );
}

/** החלון הכללי: גוף, תיעוד, אישור, ושני כפתורים. */
function ActionModal({ title, children, noteRequired, confirmLabel, submitLabel, tone, payload, onClose, onDone, canSubmit = true }: {
  title: string; children?: React.ReactNode; noteRequired: boolean; confirmLabel?: string; submitLabel: string
  tone: "danger" | "primary"; payload: (note: string) => Record<string, unknown>; onClose: () => void; onDone: Done; canSubmit?: boolean
}) {
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteOk = !noteRequired || note.trim().length >= 10;
  const ready = canSubmit && noteOk && (!confirmLabel || ok) && !busy;

  const submit = async () => {
    setBusy(true); setError("");
    const r = await postMember(payload(note.trim()));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(r.data);
  };

  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      {children}
      <NoteField value={note} onChange={setNote} required={noteRequired} />
      {noteRequired && note.trim().length > 0 && !noteOk && (
        <p style={{ fontSize: "13.5px", color: "var(--text-2)" }}>עוד {10 - note.trim().length} תווים לפחות.</p>
      )}
      {confirmLabel && <Confirm checked={ok} onChange={setOk} label={confirmLabel} />}
      {error && <Banner tone="error">{error}</Banner>}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {/* "סגירה" ולא "ביטול" — ליד "ביטול החסימה" שתי מילים זהות היו מבלבלות */}
        <button type="button" onClick={onClose} disabled={busy} style={{ ...ghostBtn, flex: 1, minHeight: "48px" }}>סגירה</button>
        <button type="button" onClick={submit} disabled={!ready} data-member-submit=""
          style={{ ...solidBtn(tone === "danger" ? "#ef4444" : "var(--blue)"), flex: 2, opacity: ready ? 1 : 0.5 }}>
          {busy ? "שולחים…" : submitLabel}
        </button>
      </div>
    </Modal>
  );
}

export type Who = { id: string; name: string };
export type Where = { id: string; name: string };

export function RejectModal({ who, where, onClose, onDone }: { who: Who; where: Where; onClose: () => void; onDone: Done }) {
  return (
    <ActionModal title="דחיית בקשת ההצטרפות" noteRequired submitLabel="דחיית הבקשה" tone="danger" onClose={onClose} onDone={onDone}
      payload={(note) => ({ action: "reject", building_id: where.id, user_id: who.id, panel_note: note })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        הבקשה של <b style={{ color: "var(--text)" }}>{who.name}</b> להצטרף ל<b style={{ color: "var(--text)" }}>{where.name}</b> תידחה.
        היא/הוא יקבלו התראה ומייל שצוות bloc לא אישר את הבקשה.
      </p>
    </ActionModal>
  );
}

export function RemoveModal({ who, where, head, onClose, onDone }: { who: Who; where: Where; head: boolean; onClose: () => void; onDone: Done }) {
  return (
    <ActionModal title="הסרה מהבניין" noteRequired submitLabel="הסרה מהבניין" tone="danger" onClose={onClose} onDone={onDone}
      confirmLabel={`ברור לי ש${who.name} לא יהיו יותר חברים ב${where.name}`}
      payload={(note) => ({ action: "remove", building_id: where.id, user_id: who.id, panel_note: note, confirm: true })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        <b style={{ color: "var(--text)" }}>{who.name}</b> לא יראו יותר את {where.name}, ויקבלו התראה. התשלומים וההיסטוריה שלהם בבניין נשארים.
        אם יש להם בניין נוסף, הוא נהיה הבניין הראשי שלהם.
      </p>
      {head && (
        <Banner tone="warn">
          זה ראש הוועד. הראשות תעבור לממלא המקום, ואם אין ממלא מקום, לחבר הוועד הוותיק. אם אין אף אחד מהם, ההסרה לא תתבצע: מנו קודם חבר ועד נוסף.
        </Banner>
      )}
    </ActionModal>
  );
}

export function RoleModal({ who, where, to, onClose, onDone }: { who: Who; where: Where; to: "admin" | "tenant"; onClose: () => void; onDone: Done }) {
  const appoint = to === "admin";
  return (
    <ActionModal title={appoint ? "מינוי לוועד" : "הסרה מהוועד"} noteRequired tone={appoint ? "primary" : "danger"}
      submitLabel={appoint ? "מינוי לוועד" : "הסרה מהוועד"} onClose={onClose} onDone={onDone}
      payload={(note) => ({ action: "set_role", building_id: where.id, user_id: who.id, role: to, panel_note: note })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        {appoint
          ? <>ל<b style={{ color: "var(--text)" }}>{who.name}</b> יהיו הרשאות ועד ב{where.name}. בכניסה הבאה הם יתבקשו לאמת את החשבון (אימות דו-שלבי). אם אין לבניין ראש ועד, הם יהיו ראש הוועד.</>
          : <><b style={{ color: "var(--text)" }}>{who.name}</b> ימשיכו כדיירים ב{where.name}, בלי הרשאות ועד.</>}
      </p>
    </ActionModal>
  );
}

export function ApartmentModal({ who, where, apartment, floor, onClose, onDone }: {
  who: Who; where: Where; apartment: string | null; floor: string | null; onClose: () => void; onDone: Done
}) {
  const [apt, setApt] = useState(apartment ?? "");
  const [fl, setFl] = useState(floor ?? "");
  const changed = apt.trim() !== (apartment ?? "") || fl.trim() !== (floor ?? "");
  return (
    <ActionModal title={`דירה וקומה ב${where.name}`} noteRequired={false} submitLabel="שמירה" tone="primary" onClose={onClose} onDone={onDone}
      canSubmit={changed}
      payload={(note) => ({ action: "set_apartment", building_id: where.id, user_id: who.id, apartment: apt.trim() || null, floor: fl.trim() || null, panel_note: note || null })}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <label style={fieldLabel}><span>דירה</span>
          <input value={apt} onChange={(e) => setApt(e.target.value)} maxLength={20} style={inputStyle} data-member-apartment="" />
        </label>
        <label style={fieldLabel}><span>קומה</span>
          <input value={fl} onChange={(e) => setFl(e.target.value)} maxLength={10} style={inputStyle} data-member-floor="" />
        </label>
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)" }}>שדה ריק מוחק את הערך. הדירה נספרת במכסת המסלול של הבניין.</p>
    </ActionModal>
  );
}

export function TransferModal({ who, from, buildings, failed = false, onClose, onDone }: {
  who: Who; from: Where; buildings: Where[]; failed?: boolean; onClose: () => void; onDone: Done
}) {
  const [to, setTo] = useState("");
  const [apt, setApt] = useState("");
  const [fl, setFl] = useState("");
  const [now, setNow] = useState(false);
  const options = buildings.filter((b) => b.id !== from.id);
  const target = options.find((b) => b.id === to);
  return (
    <ActionModal title="מעבר לבניין אחר" noteRequired submitLabel="העברה" tone="primary" onClose={onClose} onDone={onDone} canSubmit={!!to}
      payload={(note) => ({ action: "transfer", user_id: who.id, from_building_id: from.id, to_building_id: to, apartment: apt.trim() || null, floor: fl.trim() || null, approve: now, panel_note: note })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        <b style={{ color: "var(--text)" }}>{who.name}</b> ייצאו מ{from.name} ויצטרפו לבניין החדש <b style={{ color: "var(--text)" }}>כדיירים</b>. תפקיד בוועד לא עובר איתם.
        אם הם ראש הוועד, הראשות עוברת לממלא המקום או לחבר הוועד הוותיק.
      </p>
      {failed && <Banner tone="error">לא הצלחנו לטעון את רשימת הבניינים. סגרו את החלון ורעננו את הדף.</Banner>}
      <label style={fieldLabel}><span>לאיזה בניין</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} data-member-target="" disabled={failed}>
          <option value="">בחרו בניין</option>
          {options.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <label style={fieldLabel}><span>דירה בבניין החדש</span>
          <input value={apt} onChange={(e) => setApt(e.target.value)} maxLength={20} style={inputStyle} />
        </label>
        <label style={fieldLabel}><span>קומה</span>
          <input value={fl} onChange={(e) => setFl(e.target.value)} maxLength={10} style={inputStyle} />
        </label>
      </div>
      <Toggle name="approve-now" checked={now} onChange={setNow} label="לאשר מיד"
        hint={now
          ? "ההצטרפות מאושרת עכשיו (בתוך מכסת המסלול של הבניין)."
          : `הוועד של ${target?.name ?? "הבניין החדש"} יקבל בקשה ויאשר.`} />
    </ActionModal>
  );
}

export function BlockModal({ who, heads, onClose, onDone }: { who: Who; heads: string[]; onClose: () => void; onDone: Done }) {
  const [reason, setReason] = useState("");
  return (
    <ActionModal title="חסימת החשבון" noteRequired={false} submitLabel="חסימת החשבון" tone="danger" onClose={onClose} onDone={onDone}
      canSubmit={reason.trim().length >= 3}
      confirmLabel={`ברור לי ש${who.name} לא יוכלו להיכנס ל-bloc עד שהחסימה תבוטל`}
      payload={(note) => ({ action: "block", user_id: who.id, reason: reason.trim(), panel_note: note || null, confirm: true })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        הכניסה ל-bloc נחסמת בכל הבניינים. החברויות, התפקידים והתשלומים לא משתנים, וביטול החסימה מחזיר הכל בדיוק כמו שהיה.
        הוועד לא יכול לבטל את החסימה.
      </p>
      {heads.length > 0 && (
        <Banner tone="warn">
          ראש הוועד ב{heads.length === 1 ? "בניין" : "בניינים"}: {heads.join(", ")}. החסימה לא מעבירה את הראשות. אם צריך, העבירו אותה במסך המשכיות ועד.
        </Banner>
      )}
      <label style={fieldLabel}><span>סיבה (נשמרת ביומן, חובה)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} style={inputStyle} data-member-reason=""
          placeholder="למשל: התחזות לוועד, לפי בקשת בעל החשבון" />
      </label>
    </ActionModal>
  );
}

export function UnblockModal({ who, legacy, onClose, onDone }: { who: Who; legacy: boolean; onClose: () => void; onDone: Done }) {
  return (
    <ActionModal title="ביטול החסימה" noteRequired submitLabel="ביטול החסימה" tone="primary" onClose={onClose} onDone={onDone}
      payload={(note) => ({ action: "unblock", user_id: who.id, panel_note: note })}>
      <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        {legacy
          ? <>{who.name} נחסמו בשיטה הישנה, שלא שמרה את המצב הקודם. אחרי הביטול הם יחזרו כ<b style={{ color: "var(--text)" }}>ממתינים לאישור</b> בבניין הראשי שלהם, ואפשר לאשר אותם מכאן.</>
          : <>{who.name} יוכלו להיכנס שוב, עם כל החברויות והתפקידים שהיו להם.</>}
      </p>
    </ActionModal>
  );
}
