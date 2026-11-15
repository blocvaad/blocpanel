"use client";
// ספקי הסליקה שמוצעים לוועדים (bloc PAY-M, SQL 202): מתג לכל ספק, כמה בניינים מחוברים אליו, ומה כיבוי עושה —
// לפני שמכבים. סופר-אדמין משנה; שאר הצוות רואה. לפני SQL 202 — אומרים את זה, לא "הכול כבוי".
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Briefcase } from "lucide-react";
import {
  offeredSummary, turnOffLine, switchAction, turnOnBlocked, canReopenGate, validateGateEvidence, gateFromDb,
  GATE_HINT, NEEDS_225, GATE_EVIDENCE_MAX, type ProviderRow, type ProvidersState,
} from "@/lib/collectionProviders";

function countLine(n: number | null): string {
  if (n == null) return "לא הצלחנו לספור כמה בניינים מחוברים";
  if (n === 0) return "אין בניין שמחובר אליו";
  return n === 1 ? "בניין אחד מחובר" : `${n.toLocaleString("he-IL")} בניינים מחוברים`;
}

function gateDate(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "";
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
  const [gateDialog, setGateDialog] = useState<ProviderRow | null>(null);
  const [evidence, setEvidence] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
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

  // תיעוד סגירת שער / פתיחה מחדש (G14) — אותה נקודת קצה, action אחר.
  async function gateCall(row: ProviderRow, body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(row.id);
    setMsg(null);
    let ok = false;
    try {
      const res = await fetch("/api/collection-providers", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: row.id, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const gate = gateFromDb(row.id, j.provider ?? {}, true);
        setList((l) => l.map((r) => (r.id === row.id ? { ...r, gate } : r)));
        setMsg({ ok: true, text: okText });
        router.refresh();
        ok = true;
      } else {
        setMsg({ ok: false, text: j.error ?? "השינוי לא נשמר. נסו שוב." });
      }
    } catch {
      setMsg({ ok: false, text: "אין חיבור לשרת. נסו שוב." });
    }
    setBusy(null);
    return ok;
  }

  function openGateDialog(row: ProviderRow) {
    setConfirm(null); setEvidence(""); setEvidenceError(null); setGateDialog(row);
  }

  async function submitGate() {
    if (!gateDialog) return;
    const v = validateGateEvidence(evidence);
    if (!v.ok) { setEvidenceError(v.error); return; }
    setEvidenceError(null);
    const row = gateDialog;
    const ok = await gateCall(row, { action: "close_gate", evidence: v.value }, `השער של ${row.label} תועד כסגור. אפשר להדליק את הספק.`);
    if (ok) setGateDialog(null);
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
                    {r.gate.required && (
                      <div data-gate-row={r.id} data-gate-state={r.gate.closed ? "closed" : "open"} style={{ marginTop: "6px", fontSize: "13px", color: r.gate.closed ? "var(--green)" : "var(--text-2)" }}>
                        {r.gate.closed ? (
                          <>
                            <div data-gate-closed="">שער G14 סגור · {r.gate.closedBy}{gateDate(r.gate.closedAt) ? ` · ${gateDate(r.gate.closedAt)}` : ""}</div>
                            <div data-gate-evidence="" style={{ color: "var(--text-3)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.gate.evidence}</div>
                          </>
                        ) : (
                          <div data-gate-open="">שער G14 פתוח — עוד לא תועדה סגירה</div>
                        )}
                        {turnOnBlocked(r) && <div id={`gate-hint-${r.id}`} data-gate-hint="" style={{ color: "var(--text-3)", marginTop: "2px" }}>{GATE_HINT}.</div>}
                        {canEdit && !r.gate.closed && (
                          <button type="button" className="btn btn-ghost" data-gate-close={r.id} disabled={!!busy} onClick={() => openGateDialog(r)} style={{ marginTop: "6px" }}>
                            תיעוד סגירת השער
                          </button>
                        )}
                        {canReopenGate(r, canEdit) && (
                          <button type="button" className="btn btn-ghost" data-gate-reopen={r.id} disabled={!!busy}
                            onClick={() => void gateCall(r, { action: "reopen_gate" }, `השער של ${r.label} נפתח מחדש.`)} style={{ marginTop: "6px" }}>
                            פתיחה מחדש
                          </button>
                        )}
                        {canEdit && r.gate.closed && r.offered && (
                          <div data-gate-reopen-note="" style={{ color: "var(--text-3)", marginTop: "2px" }}>אפשר לפתוח מחדש רק כשהספק כבוי.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" role="switch" aria-checked={r.offered} aria-label={`${r.label} — מוצע לוועדים`}
                    disabled={!canEdit || !!busy || turnOnBlocked(r)} onClick={() => toggle(r)} data-provider-switch={r.id}
                    aria-describedby={turnOnBlocked(r) ? `gate-hint-${r.id}` : undefined}
                    style={{
                      width: "46px", height: "28px", borderRadius: "999px", border: "none", flexShrink: 0, position: "relative",
                      background: r.offered ? "var(--blue)" : "var(--border)", cursor: canEdit && !busy && !turnOnBlocked(r) ? "pointer" : "default",
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

          {gateDialog && (
            <div role="dialog" aria-label={`תיעוד סגירת השער של ${gateDialog.label}`} data-gate-dialog={gateDialog.id}
              style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--card)" }}>
              <div style={{ fontSize: "15px", fontWeight: 700 }}>תיעוד סגירת השער של {gateDialog.label}</div>
              <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
                כתבו איך נסגר סף ההפעלה (G14): מה נבדק, מתי ואיפה זה מתועד. השם והתאריך נרשמים אוטומטית.
              </p>
              <label style={{ display: "block", marginTop: "8px", fontSize: "13.5px", fontWeight: 600 }} htmlFor="gate-evidence">ראיה / הסבר</label>
              <textarea id="gate-evidence" data-gate-evidence-input="" value={evidence} rows={3} maxLength={GATE_EVIDENCE_MAX}
                onChange={(e) => { setEvidence(e.target.value); setEvidenceError(null); }}
                aria-invalid={evidenceError ? true : undefined}
                style={{ width: "100%", marginTop: "4px", padding: "8px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "inherit" }} />
              {evidenceError && <p role="alert" data-gate-evidence-error="" style={{ fontSize: "13.5px", color: "var(--red)", marginTop: "4px" }}>{evidenceError}</p>}
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button type="button" className="btn btn-primary" onClick={() => void submitGate()} disabled={!!busy} data-gate-submit="">תיעוד הסגירה</button>
                <button type="button" className="btn btn-ghost" onClick={() => setGateDialog(null)} disabled={!!busy} data-gate-cancel="">ביטול</button>
              </div>
            </div>
          )}

          {list.some((r) => !r.gate.supported) && (
            <p data-gate-missing="" style={{ marginTop: "10px", fontSize: "13.5px", color: "var(--text-3)" }}>
              שער G14 עוד לא זמין: {NEEDS_225}.
            </p>
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
