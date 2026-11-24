"use client";
// bloc COMPANY-1 (D5 — הבעלים 24/11; bloc החלטה 650): בקשות של חברות ניהול לנהל בניין שאין בו ועד פעיל — במסך חברות הניהול.
// כל בקשה: החברה, הבניין (קיים — עם הקוד שלו; חדש — מה שהחברה מסרה), מי חתם/ה על ההצהרה ובאיזה תפקיד, ומתי. אישור — הבניין נכנס
// לתיק של החברה (בניין חדש — נפתח), והחברה והדיירים מקבלים הודעה; דחייה — עם סיבה לחברה. ההחלטה ב-bloc (דרך
// /api/management-companies/links). viewer רואה ולא מחליט. כשל בטעינה — הודעה, לא "אין בקשות".
import { useCallback, useEffect, useState } from "react";
import { Modal, Banner, ghostBtn, solidBtn, fieldLabel, textareaStyle, Tag } from "./panelKit";
import { LINK_STATUS_LABEL, linkBuildingLine, linkDoneText, type LinkRequest } from "@/lib/companyLinks";

type Deciding = { r: LinkRequest; action: "approve" | "decline" };
const chars = (s: string) => [...s.trim()].length;

export function DecisionModal({ d, onClose, onDone }: { d: Deciding; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decline = d.action === "decline";
  const ready = !busy && (!decline || (chars(reason) >= 10 && chars(reason) <= 1000));
  const b = linkBuildingLine(d.r);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/management-companies/links", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: d.action, id: d.r.id, ...(decline ? { reason: reason.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof j.error === "string" ? j.error : "ההחלטה נכשלה. רעננו ונסו שוב."); setBusy(false); return; }
      onDone(linkDoneText(d.action, j));
    } catch {
      setError("אין חיבור לשרת. בדקו את החיבור, רעננו ונסו שוב."); setBusy(false);
    }
  };

  return (
    <Modal title={decline ? "דחיית הבקשה" : "אישור הבקשה"} onClose={onClose} busy={busy}>
      <div data-link-decision={d.action}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{d.r.company?.name ?? "חברת ניהול"} · {b.title}</div>
        <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7, marginTop: "4px" }}>
          {decline
            ? "החברה תקבל הודעה עם הסיבה. אפשר לשלוח בקשה חדשה אחרי שיסדרו."
            : b.isNew
              ? "הבניין ייפתח ב-bloc עם קוד הצטרפות ויכנס לתיק של החברה. עד שיהיה בו ועד, החברה מאשרת את הדיירים שמצטרפים."
              : "הבניין ייכנס לתיק של החברה, והדיירים יקבלו הודעה. עד שיהיה בו ועד, החברה מאשרת את הדיירים שמצטרפים."}
        </p>
      </div>
      {decline && (
        <label style={fieldLabel}>
          <span>הסיבה לחברה (נשלחת בהודעה)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} style={textareaStyle} data-link-reason=""
            placeholder="למשל: לא הצלחנו לאמת שהחברה מוסמכת. צרפו פרוטוקול של האסיפה ושלחו שוב." />
        </label>
      )}
      <label style={fieldLabel}>
        <span>תיעוד פנימי: מה נבדק (לא נשלח לחברה)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ ...textareaStyle, minHeight: "72px" }} data-link-note=""
          placeholder="למשל: דיברנו עם נציג הבית, ראינו הסכם ניהול חתום" />
      </label>
      {error && <Banner tone="error">{error}</Banner>}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} disabled={busy} style={{ ...ghostBtn, flex: 1, minHeight: "48px" }}>סגירה</button>
        <button type="button" onClick={submit} disabled={!ready} data-link-submit={d.action}
          style={{ ...solidBtn(decline ? "#ef4444" : "var(--blue)"), flex: 2, opacity: ready ? 1 : 0.5 }}>
          {busy ? "שולחים…" : decline ? "דחיית הבקשה" : "אישור"}
        </button>
      </div>
    </Modal>
  );
}

export default function LinkRequestsPanel() {
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState<Deciding | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/management-companies/links", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(typeof j.error === "string" ? j.error : "הבקשות לא נטענו."); return; }
      setLinks(Array.isArray(j.links) ? j.links : []);
      setCanDecide(!!j.canDecide);
    } catch {
      setError("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !links.length && !error) return null;
  return (
    <>
      <LinkRequestsView links={links} canDecide={canDecide} error={error} done={done} onRetry={load}
        onDecide={(r, action) => { setDone(""); setDeciding({ r, action }); }} />
      {deciding && <DecisionModal d={deciding} onClose={() => setDeciding(null)} onDone={(text) => { setDeciding(null); setDone(text); load(); }} />}
    </>
  );
}

/** הרשימה עצמה — בלי state (נבדקת ברינדור לשרת). אין בקשות ואין כשל — כלום (המסך לא מתמלא בכותרת ריקה). */
export function LinkRequestsView({ links, canDecide, error, done, onRetry, onDecide }: {
  links: LinkRequest[]; canDecide: boolean; error: string; done: string
  onRetry: () => void; onDecide: (r: LinkRequest, action: "approve" | "decline") => void
}) {
  const pending = links.filter((l) => l.status === "pending").length;
  if (!error && !links.length) return null;

  return (
    <section id="links" className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }} aria-label="בקשות לבניינים בלי ועד" data-link-requests={pending}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>בקשות לנהל בניין בלי ועד</h2>
        {pending > 0 && <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: "14px" }}>{pending} ממתינות</span>}
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--text-3)", lineHeight: 1.6 }}>
        החברה מצהירה שהיא מוסמכת לנהל את הבניין מטעם נציגות הבית או בעלי הדירות. אפשר לבקש ממנה מסמך לפני האישור.
      </p>
      {done && <Banner tone="ok">{done}</Banner>}
      {error && <Banner tone="error" action={<button type="button" onClick={onRetry} style={ghostBtn}>נסו שוב</button>}>{error}</Banner>}
      {links.map((r) => {
        const b = linkBuildingLine(r);
        const tone = r.status === "pending" ? "wait" : r.status === "approved" ? "ok" : r.status === "declined" ? "danger" : "muted";
        return (
          <div key={r.id} data-link-row={r.status} style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{r.company?.name ?? "חברת ניהול"}</span>
              <Tag tone={tone}>{LINK_STATUS_LABEL[r.status] ?? r.status}</Tag>
            </div>
            <div style={{ fontSize: "14.5px", color: "var(--text)" }}>
              {b.title}{b.isNew ? " · בניין חדש" : ""}
              {r.building?.invite_code && <bdi dir="ltr" style={{ marginInlineStart: "8px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{r.building.invite_code}</bdi>}
            </div>
            {b.detail && <div style={{ fontSize: "13.5px", color: "var(--text-3)" }}>{b.detail}</div>}
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
              ההצהרה: {r.signer_name ? `${r.signer_name}, ` : ""}{r.signer_role}{r.requester && r.requester !== r.signer_name ? ` · נשלחה ע״י ${r.requester}` : ""}
              {" · "}{new Date(r.created_at).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
            </div>
            {r.status === "declined" && r.decline_reason && <div style={{ fontSize: "13.5px", color: "var(--text-3)" }}>הסיבה: {r.decline_reason}</div>}
            {r.status === "pending" && canDecide && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => onDecide(r, "approve")} style={{ ...solidBtn("var(--blue)"), minHeight: "44px", flex: 1 }} data-link-approve={r.id}>אישור</button>
                <button type="button" onClick={() => onDecide(r, "decline")} style={{ ...ghostBtn, minHeight: "44px", flex: 1 }} data-link-decline={r.id}>דחייה</button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
