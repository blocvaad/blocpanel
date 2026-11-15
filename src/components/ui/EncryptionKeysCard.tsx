"use client";
// src/components/ui/EncryptionKeysCard.tsx — "מפתחות הצפנה" בדף האבטחה (bloc KEYS-1, החלטות 358–360).
//
// פרטי בנק של ספקים: האם יש מפתח, מזהה המפתח הנוכחי, המזהים שנקראים, וכמה ערכים בפורמט הישן / במפתח קודם / בנוכחי /
// לא קריאים. סודות הסליקה: שורה בלי כפתור — נשארים על המפתח הישן עד שהבעלים מעביר את הקובץ שלו.
// סופר-אדמין: "הרצת ניסיון" (מה ישתנה, בלי לשנות) ו"הצפנה מחדש" (אישור עם המספרים של הניסיון והערה; חסום בלי מפתח
// ובלי ניסיון טרי). טוען ≠ נכשל ≠ ריק — שלושה מצבים שונים. מפתח לא מגיע לכאן לעולם, רק מזהים וספירות.
//
// EncryptionKeysView — התצוגה בלבד (props → markup), כדי שהבדיקה תרנדר כל מצב בשרת (בפאנל אין happy-dom).
import { useCallback, useEffect, useState } from "react";
import { Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn, fieldLabel, textareaStyle } from "./panelKit";
import { PANEL_SESSION_CODE } from "@/lib/panelSession";
import {
  KIND_LABELS, KIND_ENV, LEGACY_ENV, NOTE_MAX, ONLY_SUPERADMIN_TEXT, NET_ERROR_TEXT,
  hasCurrentKey, keyTag, noKeyText, currentShare, isEmptyStatus, dryRunState, dryRunBlock, reencryptBlock,
  checkNote, afterDryRun, afterReencrypt, dryRunBody, reencryptBody, fmtCount, agoText,
  type KeysStatus, type KindStatus, type KeyCounts, type DryRun, type DryRunState, type KeysMsg, type LastRun, type PostAnswer,
} from "@/lib/encryptionKeys";

export type KeysLoad =
  | { phase: "loading" }
  | { phase: "error"; error: string; login?: boolean }
  | { phase: "ready"; status: KeysStatus; checkedAt: string };
export type KeysBusy = null | "status" | "dry_run" | "reencrypt";

export type KeysViewProps = {
  load: KeysLoad;
  canAct: boolean;
  now: number;
  dry: DryRun | null;
  last: LastRun | null;
  confirmOpen: boolean;
  note: string;
  noteError: string | null;
  busy: KeysBusy;
  msg: KeysMsg | null;
  onRefresh?: () => void;
  onDryRun?: () => void;
  onOpenConfirm?: () => void;
  onCloseConfirm?: () => void;
  onNote?: (v: string) => void;
  onReencrypt?: () => void;
};

const NO_KEY_SHORT = "ניסיון והצפנה מחדש ייפתחו אחרי שמגדירים מפתח נוכחי.";

const muted: React.CSSProperties = { fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 };
const small: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)" };
const box: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)" };
const kidChip: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: "12.5px", padding: "1px 8px", borderRadius: "6px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" };
const statGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "8px" };
// כפתור חסום נראה חסום (אפור, כמו "אמת" בכרטיס ה-2FA) — לא כחול חלש שנראה לחיץ.
const solidOn = (on: boolean): React.CSSProperties =>
  on ? { ...solidBtn("var(--blue)"), cursor: "pointer" } : { ...solidBtn("var(--border)", "var(--text-3)"), cursor: "not-allowed" };
const ghostOn = (on: boolean): React.CSSProperties =>
  on ? { ...ghostBtn, cursor: "pointer" } : { ...ghostBtn, color: "var(--text-3)", cursor: "not-allowed" };

function Kid({ id }: { id: string }) {
  return <bdi dir="ltr" style={kidChip} data-kid={id}>{id}</bdi>;
}
function EnvName({ name }: { name: string }) {
  return <bdi dir="ltr" style={{ fontFamily: "var(--mono)", fontSize: "12.5px" }}>{name}</bdi>;
}

type Tone = "neutral" | "warn" | "ok" | "bad" | "info";
const TONE_COLOR: Record<Tone, string> = { neutral: "var(--text)", warn: "var(--yellow)", ok: "var(--green)", bad: "var(--red)", info: "var(--blue)" };

function Stat({ label, value, tone = "neutral", id }: { label: string; value: number; tone?: Tone; id: string }) {
  return (
    <div data-keys-stat={id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--card)", minWidth: 0 }}>
      <dt style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ fontSize: "20px", fontWeight: 700, color: value > 0 ? TONE_COLOR[tone] : "var(--text-3)", fontVariantNumeric: "tabular-nums", marginTop: "2px" }}>{fmtCount(value)}</dd>
    </div>
  );
}

function CountsBlock({ c, keyOk }: { c: KeyCounts; keyOk: boolean }) {
  // אחוז "על המפתח הנוכחי" — רק כשיש מפתח נוכחי; בלי מפתח זה מספר בלי משמעות.
  const share = keyOk ? currentShare(c) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-keys-counts="">
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", ...small }}>
          {share !== null ? <span data-keys-share={share}>{share}% על המפתח הנוכחי</span> : <span />}
          <span>{c.rows === 1 ? "שורה אחת" : `${fmtCount(c.rows)} שורות`}</span>
        </div>
        {share !== null && (
          <div role="progressbar" aria-label="ערכים על המפתח הנוכחי" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}
            style={{ marginTop: "6px", height: "6px", borderRadius: "99px", background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${share}%`, height: "100%", borderRadius: "99px", background: share === 100 ? "var(--green)" : "var(--blue)" }} />
          </div>
        )}
      </div>
      <dl style={statGrid}>
        <Stat id="legacy" label="פורמט ישן" value={c.legacy} tone="warn" />
        <Stat id="oldKid" label="מפתח קודם" value={c.oldKid} tone="warn" />
        <Stat id="current" label="מפתח נוכחי" value={c.current} tone="ok" />
        <Stat id="unreadable" label="לא קריאים" value={c.unreadable} tone="bad" />
      </dl>
      {c.unreadable > 0 && (
        <p data-keys-unreadable="" style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13.5px", color: "var(--red)", lineHeight: 1.6 }}>
          <AlertTriangle size={15} aria-hidden style={{ flexShrink: 0, marginTop: "3px" }} />
          <span>
            {c.unreadable === 1 ? "ערך אחד לא נפתח" : `${fmtCount(c.unreadable)} ערכים לא נפתחים`} באף מפתח שברשימה. ההצפנה מחדש לא נוגעת בהם — כדאי לבדוק
            אם מפתח ישן הוסר מ-<EnvName name={KIND_ENV.supplier_bank} />.
          </span>
        </p>
      )}
    </div>
  );
}

function DryRunPanel({ dry, state, now }: { dry: DryRun; state: DryRunState; now: number }) {
  const stale = state !== "fresh";
  const c = dry.counts;
  return (
    <div data-keys-dry="" data-keys-dry-state={state}
      style={{ ...box, background: "var(--card)", borderRight: `3px solid ${stale ? "var(--yellow)" : "var(--blue)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>ריצת ניסיון</span>
        <span style={small}>{agoText(dry.at, now)}{stale ? " · ישנה" : ""}</span>
      </div>
      {c.changed === 0
        ? <p data-keys-dry-nothing="" style={{ ...muted, color: "var(--green)" }}>אין מה להצפין מחדש — כל הערכים שנקראים כבר על המפתח הנוכחי.</p>
        : <p style={muted}>אם תריצו עכשיו הצפנה מחדש, זה מה שיקרה בסבב הזה (עד 200 שורות). ערכים לא קריאים לא ייגעו. שום דבר עוד לא שונה.</p>}
      <dl style={statGrid}>
        <Stat id="changed" label="ייכתבו מחדש" value={c.changed} tone="info" />
        <Stat id="unreadable" label="לא קריאים" value={c.unreadable} tone="bad" />
        <Stat id="remaining" label="יישארו אחרי הסבב" value={c.remaining} tone="warn" />
        <Stat id="scanned" label="נסרקו" value={c.scanned} />
        {c.conflicts > 0 && <Stat id="conflicts" label="התנגשויות" value={c.conflicts} tone="warn" />}
      </dl>
    </div>
  );
}

function LastRunPanel({ last, now }: { last: LastRun; now: number }) {
  const c = last.counts;
  return (
    <div data-keys-last="" style={{ ...box, background: "var(--card)", borderRight: `3px solid ${c.remaining === 0 ? "var(--green)" : "var(--blue)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>הסבב הסתיים</span>
        <span style={small}>{agoText(last.at, now)}</span>
      </div>
      <dl style={statGrid}>
        <Stat id="changed" label="הוצפנו מחדש" value={c.changed} tone="ok" />
        <Stat id="conflicts" label="התנגשויות" value={c.conflicts} tone="warn" />
        <Stat id="unreadable" label="לא קריאים" value={c.unreadable} tone="bad" />
        <Stat id="remaining" label="נשארו" value={c.remaining} tone="warn" />
      </dl>
      {c.remaining > 0
        ? <p data-keys-last-more="" style={muted}>{c.remaining === 1 ? "נשאר ערך אחד" : `נשארו ${fmtCount(c.remaining)} ערכים`} — מריצים ניסיון וסבב נוסף.</p>
        : <p data-keys-last-done="" style={{ ...muted, color: "var(--green)" }}>סיימנו: כל הערכים שנקראים כבר על המפתח הנוכחי{c.unreadable > 0 ? " (הלא קריאים נשארו כמו שהם)" : ""}.</p>}
      {c.conflicts > 0 && (
        <p data-keys-last-conflicts="" style={small}>
          התנגשות = הערך השתנה בזמן הסבב (ספק שמר פרטים חדשים), ולכן לא נדרס. שמירה חדשה כבר מוצפנת במפתח הנוכחי.
        </p>
      )}
    </div>
  );
}

function ConfirmBox({ s, dry, p }: { s: KindStatus; dry: DryRun; p: KeysViewProps }) {
  const c = dry.counts;
  const block = reencryptBlock(s, dry, p.now, p.canAct);
  return (
    <div role="alertdialog" aria-labelledby="keys-confirm-title" aria-describedby="keys-confirm-body" data-keys-confirm=""
      style={{ ...box, background: "var(--card)", borderColor: "var(--border-2)" }}>
      <div id="keys-confirm-title" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>
        להצפין מחדש {c.changed === 1 ? "ערך אחד" : `${fmtCount(c.changed)} ערכים`} במפתח {s.currentKid ? <Kid id={s.currentKid} /> : "—"}?
      </div>
      <p id="keys-confirm-body" style={muted} data-keys-confirm-counts="">
        לפי ריצת הניסיון ({agoText(dry.at, p.now)}): {fmtCount(c.changed)} ייכתבו מחדש, {fmtCount(c.unreadable)} לא קריאים יישארו כמו שהם,
        ו-{fmtCount(c.remaining)} יחכו לסבב הבא. ערך שספק שינה בינתיים לא נדרס — הוא נספר כהתנגשות.
      </p>
      <label style={fieldLabel}>
        הערה (חובה, לפחות 10 תווים)
        <textarea data-keys-note="" value={p.note} rows={3} maxLength={NOTE_MAX} onChange={(e) => p.onNote?.(e.target.value)}
          placeholder="למה עכשיו? למשל: הוגדר k2 ב-Vercel של bloc" aria-invalid={p.noteError ? true : undefined}
          aria-describedby="keys-note-hint" disabled={!!p.busy} style={textareaStyle} />
      </label>
      <p id="keys-note-hint" style={small}>לא מדביקים כאן מפתח — רק מה נעשה ולמה.</p>
      {p.noteError && <p role="alert" data-keys-note-error="" style={{ fontSize: "13.5px", color: "var(--red)" }}>{p.noteError}</p>}
      {block && <p data-keys-confirm-block="" style={{ fontSize: "13.5px", color: "var(--yellow)" }}>{block}</p>}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" data-keys-confirm-go="" onClick={p.onReencrypt} disabled={!!p.busy || !!block}
          style={{ ...solidOn(!p.busy && !block), flex: "1 1 160px" }}>
          {p.busy === "reencrypt" ? "מצפינים מחדש…" : "הצפנה מחדש"}
        </button>
        <button type="button" data-keys-confirm-cancel="" onClick={p.onCloseConfirm} disabled={!!p.busy} style={{ ...ghostBtn, flex: "0 1 120px" }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function SupplierBankBlock({ s, p }: { s: KindStatus; p: KeysViewProps }) {
  const tag = keyTag(s);
  const noKey = noKeyText(s);
  const empty = isEmptyStatus(s);
  const keyOk = hasCurrentKey(s);
  const dryState = dryRunState(p.dry, s, p.now);
  const dryBlock = dryRunBlock(s, p.canAct);
  const reBlock = reencryptBlock(s, p.dry, p.now, p.canAct);
  const hint = !keyOk ? NO_KEY_SHORT : reBlock;
  return (
    <div data-keys-kind="supplier_bank" style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{KIND_LABELS.supplier_bank}</span>
        <span data-keys-key-state={tag.tone}>
          <Tag tone={tag.tone}>{tag.text}{keyOk && s.currentKid ? <>{" "}<bdi dir="ltr" style={{ fontFamily: "var(--mono)" }}>{s.currentKid}</bdi></> : null}</Tag>
        </span>
      </div>
      {noKey && <p data-keys-nokey="" style={{ ...muted, color: tag.tone === "danger" ? "var(--red)" : "var(--text-2)" }}>{noKey}</p>}
      <div data-keys-kids="" style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "13px", color: "var(--text-2)" }}>
        <span>מפתחות לקריאה:</span>
        {s.kids.length ? s.kids.map((k) => <Kid key={k} id={k} />) : <span>אין (רק הפורמט הישן)</span>}
      </div>

      {s.counts === null ? (
        <p data-keys-counts-missing="" style={muted}>הספירה לא הגיעה מ-bloc, ולכן לא מוצגים מספרים.</p>
      ) : empty ? (
        <p data-keys-empty="" style={muted}>
          אין עדיין פרטי בנק שמורים, ולכן אין מה להצפין מחדש. ספק ששומר פרטים מעכשיו יוצפן{" "}
          {keyOk && s.currentKid ? <>במפתח <Kid id={s.currentKid} /></> : "במפתח הישן"}.
        </p>
      ) : (
        <CountsBlock c={s.counts} keyOk={keyOk} />
      )}

      {!empty && (p.canAct ? (
        <div data-keys-actions="" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" data-keys-dry-run="" onClick={p.onDryRun} disabled={!!p.busy || !!dryBlock}
              aria-describedby={hint ? "keys-hint" : undefined}
              style={{ ...ghostOn(!p.busy && !dryBlock), flex: "1 1 140px" }}>
              {p.busy === "dry_run" ? "מריצים ניסיון…" : "הרצת ניסיון"}
            </button>
            <button type="button" data-keys-reencrypt="" onClick={p.onOpenConfirm} disabled={!!p.busy || !!reBlock || p.confirmOpen}
              aria-describedby={hint ? "keys-hint" : undefined}
              style={{ ...solidOn(!p.busy && !reBlock && !p.confirmOpen), flex: "1 1 140px" }}>
              {p.busy === "reencrypt" ? "מצפינים מחדש…" : "הצפנה מחדש"}
            </button>
          </div>
          {hint && <p id="keys-hint" data-keys-hint="" style={small}>{hint}</p>}
          {p.dry && dryState !== "none" && <DryRunPanel dry={p.dry} state={dryState} now={p.now} />}
          {p.confirmOpen && p.dry && <ConfirmBox s={s} dry={p.dry} p={p} />}
        </div>
      ) : (
        <p data-keys-viewonly="" style={small}>{ONLY_SUPERADMIN_TEXT}</p>
      ))}
      {p.last && <LastRunPanel last={p.last} now={p.now} />}
    </div>
  );
}

function PaymentBlock({ payment }: { payment: KindStatus | null }) {
  return (
    <div data-keys-kind="payment" style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{KIND_LABELS.payment}</span>
        <Tag tone="muted">על המפתח הישן</Tag>
      </div>
      <p style={muted}>
        נשארים על <EnvName name={LEGACY_ENV} /> עד שהבעלים מעביר את הקובץ שלו לממשק החדש. אין כאן כפתור — ההעברה היא החלטה של הבעלים.
      </p>
      {payment && hasCurrentKey(payment) && payment.currentKid && (
        <p data-keys-payment-ready="" style={small}>מפתח חדש כבר מוגדר (<Kid id={payment.currentKid} />) ומחכה להעברה.</p>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div data-keys-loading="" role="status" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={muted}>בודקים את מצב ההצפנה ב-bloc…</span>
      {[64, 96].map((h) => (
        <div key={h} aria-hidden style={{ position: "relative", overflow: "hidden", height: `${h}px`, borderRadius: "12px", border: "1px solid var(--border)" }}>
          <div className="skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

const loginLink = <a href="/login" style={{ ...ghostBtn, textDecoration: "none" }} data-login-again="">להתחברות</a>;

export function EncryptionKeysView(p: KeysViewProps) {
  const phase = p.load.phase === "ready" ? (isEmptyStatus(p.load.status.supplierBank) ? "empty" : "ready") : p.load.phase;
  const checked = p.load.phase === "ready" ? new Date(p.load.checkedAt) : null;
  const msgEl = p.msg && (p.msg.ok
    ? <p role="status" data-keys-msg="ok" style={{ fontSize: "14px", color: "var(--green)" }}>{p.msg.text}</p>
    : <div data-keys-msg="error"><Banner tone="error" action={p.msg.login ? loginLink : undefined}>{p.msg.text}</Banner></div>);
  return (
    <section className="card" aria-labelledby="keys-title" aria-busy={p.load.phase === "loading" || p.busy === "status" ? true : undefined}
      data-keys-card="" data-keys-state={phase} style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", minWidth: 0 }}>
          <span aria-hidden style={{ width: "34px", height: "34px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#3b82f618", color: "var(--blue)", flexShrink: 0 }}>
            <Lock size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 id="keys-title" style={{ fontSize: "15.5px", fontWeight: 700, color: "var(--text)" }}>מפתחות הצפנה</h2>
            <p style={{ ...muted, marginTop: "3px" }}>
              איזה מפתח מצפין את פרטי הבנק של הספקים, ומה עוד מוצפן בישן.
            </p>
            {checked && !Number.isNaN(checked.getTime()) && (
              <p style={{ ...small, marginTop: "2px" }} data-keys-checked="">
                נבדק ב-{checked.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={p.onRefresh} disabled={!!p.busy} data-keys-refresh="" aria-label="רענון מצב ההצפנה"
          style={{ ...ghostBtn, minHeight: "40px", padding: "0 12px", fontSize: "13px", flexShrink: 0 }}>
          <RefreshCw size={14} aria-hidden /> רענון
        </button>
      </header>

      {p.load.phase === "loading" && <LoadingRows />}

      {p.load.phase === "error" && (
        <div data-keys-error="">
          <Banner tone="error" action={p.load.login ? loginLink : (
            <button type="button" onClick={p.onRefresh} disabled={!!p.busy} data-keys-retry="" style={ghostBtn}>נסו שוב</button>
          )}>
            {p.load.error}
          </Banner>
        </div>
      )}

      {p.load.phase === "ready" && (
        <>
          <SupplierBankBlock s={p.load.status.supplierBank} p={p} />
          {msgEl}
          <PaymentBlock payment={p.load.status.payment} />
        </>
      )}
      {/* תוצאת הסבב והודעת הפעולה נשארות גם כשרענון המצב שאחריהן נכשל — סבב שרץ (או נכשל) לא נעלם מאחורי שגיאת טעינה */}
      {p.load.phase !== "ready" && p.last && <LastRunPanel last={p.last} now={p.now} />}
      {p.load.phase !== "ready" && msgEl}

      <p style={{ ...small, lineHeight: 1.6 }}>
        המפתחות נשמרים ב-Vercel של bloc ולא מגיעים לפאנל — כאן רק מזהים (kid) וספירות. כל ריצה, גם ניסיון, נרשמת ביומן: מי הריץ,
        הסוג והספירות.
      </p>
    </section>
  );
}

export default function EncryptionKeysCard({ canAct }: { canAct: boolean }) {
  const [load, setLoad] = useState<KeysLoad>({ phase: "loading" });
  const [dry, setDry] = useState<DryRun | null>(null);
  const [last, setLast] = useState<LastRun | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<KeysBusy>(null);
  const [msg, setMsg] = useState<KeysMsg | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // GET /api/keys → מצב הכרטיס. מחזיר את המצב (או null בכשל) כדי שריצת ניסיון תיקשר למצב שאחריה.
  const fetchStatus = useCallback(async (): Promise<KeysStatus | null> => {
    try {
      const r = await fetch("/api/keys", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.status) {
        setLoad({ phase: "ready", status: j.status as KeysStatus, checkedAt: String(j.checkedAt ?? new Date().toISOString()) });
        return j.status as KeysStatus;
      }
      setLoad({ phase: "error", error: j.error ?? "לא הצלחנו לטעון את מצב ההצפנה. נסו שוב.", login: r.status === 401 && j.code === PANEL_SESSION_CODE });
    } catch {
      setLoad({ phase: "error", error: NET_ERROR_TEXT });
    }
    return null;
  }, []);

  const refresh = useCallback(async () => {
    setBusy("status");
    setMsg(null);
    await fetchStatus();
    setNow(Date.now());
    setBusy(null);
  }, [fetchStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ריצת ניסיון פגה אחרי 10 דקות — השעון מתעדכן כדי שהכפתור ייחסם בזמן, גם בלי לחיצה.
  useEffect(() => {
    if (!dry) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [dry]);

  /** POST /api/keys עם גוף מ-lib (dryRunBody / reencryptBody). null = אין חיבור לשרת. */
  async function post(body: ReturnType<typeof dryRunBody> | ReturnType<typeof reencryptBody>): Promise<PostAnswer | null> {
    try {
      const r = await fetch("/api/keys", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, j };
    } catch {
      return null;
    }
  }

  async function runDry() {
    if (busy) return;
    const prev = load.phase === "ready" ? load.status.supplierBank : null;
    setBusy("dry_run"); setMsg(null); setLast(null); setConfirmOpen(false); setNoteError(null);
    const a = await post(dryRunBody());
    // הטביעה של הניסיון — לפי המצב שנקרא מיד אחריו
    const fresh = a?.ok && a.j.result ? (await fetchStatus())?.supplierBank ?? null : null;
    const o = afterDryRun(a, fresh, prev, Date.now());
    setDry(o.dry); setMsg(o.msg);
    if (o.reload) await fetchStatus();
    setNow(Date.now());
    setBusy(null);
  }

  async function runReencrypt() {
    if (busy || load.phase !== "ready") return;
    const block = reencryptBlock(load.status.supplierBank, dry, Date.now(), canAct);
    if (block) { setNow(Date.now()); return; }   // הכפתור כבר חסום עם ההסבר — רק מרעננים את השעון
    const n = checkNote(note, true);
    if (!n.ok) { setNoteError(n.error); return; }
    setBusy("reencrypt"); setMsg(null); setNoteError(null);
    // האישור של ריצת הניסיון הטרייה נשלח עם הסבב (C5); ניסיון שנמחק — האישור איתו
    const o = afterReencrypt(await post(reencryptBody(n.value, dry)), Date.now());
    if (o.last) setLast(o.last);
    if (!o.keepDry) setDry(null);
    setConfirmOpen(o.confirmOpen);
    if (o.clearNote) setNote("");
    setNoteError(o.noteError);
    setMsg(o.msg);
    if (o.reload) await fetchStatus();
    setNow(Date.now());
    setBusy(null);
  }

  return (
    <EncryptionKeysView
      load={load} canAct={canAct} now={now} dry={dry} last={last} confirmOpen={confirmOpen} note={note}
      noteError={noteError} busy={busy} msg={msg}
      onRefresh={() => void refresh()}
      onDryRun={() => void runDry()}
      onOpenConfirm={() => { setConfirmOpen(true); setNoteError(null); setMsg(null); setNow(Date.now()); }}
      onCloseConfirm={() => { setConfirmOpen(false); setNoteError(null); }}
      onNote={(v) => { setNote(v); setNoteError(null); }}
      onReencrypt={() => void runReencrypt()}
    />
  );
}
