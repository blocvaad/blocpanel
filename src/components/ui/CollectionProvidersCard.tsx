"use client";
// ספקי הסליקה שמוצעים לוועדים (bloc PAY-M, SQL 202): מתג לכל ספק, כמה בניינים מחוברים אליו, ומה כיבוי עושה —
// לפני שמכבים. סופר-אדמין משנה; שאר הצוות רואה. לפני SQL 202 — אומרים את זה, לא "הכול כבוי".
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Briefcase } from "lucide-react";
import { offeredSummary, turnOffLine, switchAction, type ProviderRow, type ProvidersState } from "@/lib/collectionProviders";

function countLine(n: number | null): string {
  if (n == null) return "לא הצלחנו לספור כמה בניינים מחוברים";
  if (n === 0) return "אין בניין שמחובר אליו";
  return n === 1 ? "בניין אחד מחובר" : `${n.toLocaleString("he-IL")} בניינים מחוברים`;
}

function changedLine(r: ProviderRow): string | null {
  if (!r.updatedAt || !r.updatedBy) return null;
  const d = new Date(r.updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `שונה ב-${d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })} · ${r.updatedBy}`;
}

export default function CollectionProvidersCard({ rows, state, canEdit }: {
  rows: ProviderRow[];
  /** 'missing' = SQL 202 עוד לא רץ; 'error' = הקריאה נכשלה. */
  state: ProvidersState;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState(rows);
  // אחרי router.refresh() השרת שולח שורות חדשות (כמה בניינים מחוברים, מי שינה) — מתעדכנים מהן.
  useEffect(() => { setList(rows); }, [rows]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ProviderRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(row: ProviderRow, offered: boolean) {
    setBusy(row.id);
    setMsg(null);
    setConfirm(null);
    try {
      const res = await fetch("/api/collection-providers", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: row.id, offered }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setList((l) => l.map((r) => (r.id === row.id ? { ...r, offered } : r)));
        setMsg({ ok: true, text: offered ? `${row.label} מוצע עכשיו לוועדים.` : `${row.label} כבר לא מוצע לוועדים חדשים.` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: j.error ?? "השינוי לא נשמר. נסו שוב." });
      }
    } catch {
      setMsg({ ok: false, text: "אין חיבור לשרת. נסו שוב." });
    }
    setBusy(null);
  }

  function toggle(row: ProviderRow) {
    const action = switchAction(row, canEdit, !!busy);
    if (action === "confirm") setConfirm(row);
    else if (action === "turn_on") void save(row, true);
  }

  return (
    <div className="card" style={{ padding: "16px" }} data-collection-providers="">
      {state === "missing" && (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-collection-missing="">
          עוד לא זמין: צריך להריץ את SQL 202 של bloc.
        </p>
      )}
      {state === "error" && (
        <p role="alert" style={{ fontSize: "14.5px", color: "var(--red)" }} data-collection-error="">
          לא הצלחנו לטעון את ספקי הסליקה. רעננו את הדף.
        </p>
      )}

      {state === "ok" && (
        <>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)" }} data-collection-summary="">{offeredSummary(list)}</p>
          <ul style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {list.map((r) => {
              const Icon = r.kind === "card" ? CreditCard : Briefcase;
              const changed = changedLine(r);
              return (
                <li key={r.id} data-provider-row={r.id}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <Icon size={18} aria-hidden style={{ flexShrink: 0, color: r.offered ? "var(--blue)" : "var(--text-3)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{r.label}</div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-3)" }}>
                      {r.kind === "card" ? "תשלום באשראי באפליקציה" : "הדיירים משלמים לחברת הניהול, בקישור שלה"} · <span data-provider-count="">{countLine(r.buildings)}</span>
                    </div>
                    {changed && <div style={{ fontSize: "12.5px", color: "var(--text-3)", marginTop: "2px" }}>{changed}</div>}
                  </div>
                  <button type="button" role="switch" aria-checked={r.offered} aria-label={`${r.label} — מוצע לוועדים`}
                    disabled={!canEdit || !!busy} onClick={() => toggle(r)} data-provider-switch={r.id}
                    style={{
                      width: "46px", height: "28px", borderRadius: "999px", border: "none", flexShrink: 0, position: "relative",
                      background: r.offered ? "var(--blue)" : "var(--border)", cursor: canEdit && !busy ? "pointer" : "default",
                      opacity: busy === r.id ? 0.6 : 1,
                    }}>
                    <span aria-hidden style={{
                      position: "absolute", top: "3px", width: "22px", height: "22px", borderRadius: "999px", background: "#fff",
                      // כמו המתגים בשאר הפאנל (broadcastKit): ב-RTL "פועל" = העיגול משמאל.
                      right: r.offered ? "21px" : "3px", transition: "right .15s",
                    }} />
                  </button>
                </li>
              );
            })}
          </ul>

          {confirm && (
            <div role="alertdialog" aria-label={`לכבות את ${confirm.label}?`} data-provider-confirm={confirm.id}
              style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--card)" }}>
              <div style={{ fontSize: "15px", fontWeight: 700 }}>לכבות את {confirm.label}?</div>
              <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>{turnOffLine(confirm)}</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button type="button" className="btn btn-danger" onClick={() => void save(confirm, false)} disabled={!!busy} data-provider-confirm-off="">
                  לכבות
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)} disabled={!!busy}>ביטול</button>
              </div>
            </div>
          )}

          {msg && (
            <p role={msg.ok ? "status" : "alert"} data-collection-msg={msg.ok ? "ok" : "error"}
              style={{ marginTop: "10px", fontSize: "14px", color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</p>
          )}
          {!canEdit && <p style={{ marginTop: "10px", fontSize: "13.5px", color: "var(--text-3)" }}>רק סופר-אדמין משנה את הספקים.</p>}
          <p style={{ marginTop: "12px", fontSize: "13.5px", color: "var(--text-3)", lineHeight: 1.6 }}>
            הדייר רואה &quot;תשלום באשראי&quot;, בלי שם הספק. כדי להחליף ספק: מדליקים את החדש ומכבים את הישן. בניין שכבר מחובר
            ממשיך לגבות דרך הספק שלו עד שהוועד מנתק ומתחבר לחדש.
          </p>
        </>
      )}
    </div>
  );
}
