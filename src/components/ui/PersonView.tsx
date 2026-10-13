"use client";
// דף אדם (bloc UI-R5c-1): מי זה, באילו בניינים (כולם — לא רק הראשי), באיזה תפקיד, התשלומים שלו (לפי המזהה,
// לא לפי השם), מה נעשה איתו — והפעולות: אישור / דחייה, ועד, דירה וקומה, מעבר, הסרה, חסימה.
// הפעולות נשלחות ל-bloc (/api/members); אחרי הצלחה — הודעה במילים, והדף נטען מחדש.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Phone, Mail, ShieldAlert, ShieldCheck, Ban, Home, ArrowLeftRight, UserMinus, UserPlus, Check, X, Crown } from "lucide-react";
import { Section, Banner, ghostBtn, Tag, postMember } from "./panelKit";
import { RejectModal, RemoveModal, RoleModal, ApartmentModal, TransferModal, BlockModal, UnblockModal, type Who, type Where } from "./memberModals";
import { ilDate, ilDateTime, ilTime } from "@/lib/committee";
import { roleLabel, MEMBERSHIP_STATUS, personaLabel, paymentTotals, BLOC_ACTION_LABEL, blocActor, blockTag, isLegacyBlock, type PersonDetail } from "@/lib/people";
import { paymentStatusLabel } from "@/lib/paymentStatus";
import { AUDIT_LABELS } from "@/lib/auditLabels";

type Membership = PersonDetail["memberships"][number];
type Open =
  | { kind: "reject" | "remove" | "apartment" | "transfer" | "promote" | "demote"; m: Membership }
  | { kind: "block" | "unblock" }
  | null;

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

export default function PersonView({ detail, canAct, buildings, buildingsFailed = false }: { detail: PersonDetail; canAct: boolean; buildings: Where[]; buildingsFailed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [done, setDone] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const p = detail.person;
  const name = (p.full_name ?? "").trim() || "ללא שם";
  const who: Who = { id: p.id, name };
  const where = (m: Membership): Where => ({ id: m.building_id, name: m.building?.name?.trim() || "בניין" });
  const live = detail.memberships.filter((m) => m.status === "active" || m.status === "pending");
  const past = detail.memberships.filter((m) => m.status === "removed");
  const heads = live.filter((m) => m.status === "active" && m.role === "admin" && m.building?.founder_id === p.id).map((m) => where(m).name);
  const persona = personaLabel(p.role);
  const blk = detail.openBlock;
  // השיטה הישנה: הסטטוס בפרופיל (ול-172 יש לו גם שורה, legacy). הביטול מחזיר אותו כממתין לאישור.
  const legacyStatus = p.approval_status === "blocked" && !p.deleted_at;
  const legacyRow = isLegacyBlock(blk);
  const blocked = !!blk || legacyStatus;
  const tag = blockTag({ block: blk, legacyStatus });
  const deleted = !!p.deleted_at;
  const totals = paymentTotals(detail.payments);

  const finish = (text: string) => { setOpen(null); setError(""); setDone(text); router.refresh(); };

  const approve = async (m: Membership) => {
    setApproving(m.id); setError(""); setDone("");
    const r = await postMember({ action: "approve", building_id: m.building_id, user_id: p.id });
    setApproving(null);
    if (!r.ok) { setError(r.error); return; }
    finish(`ההצטרפות ל${where(m).name} אושרה. נשלחו התראה ומייל.`);
  };

  const activity = [
    ...detail.panelLog.map((l) => ({
      id: `p-${l.id}`, at: l.created_at,
      label: AUDIT_LABELS[l.action]?.label ?? "פעולה בפאנל",
      who: "צוות bloc", email: l.admin_email,
    })),
    ...detail.blocLog.map((l) => {
      const actor = blocActor(l.details);
      return {
        id: `b-${l.id}`, at: l.created_at,
        label: `${BLOC_ACTION_LABEL[l.action] ?? "פעולה ב-bloc"}${l.building_id && detail.buildingNames[l.building_id] ? ` (${detail.buildingNames[l.building_id]})` : ""}`,
        who: actor ? "צוות bloc" : "באפליקציה",
        email: actor && typeof l.details?.panel_admin === "string" ? l.details.panel_admin : null,
      };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "820px" }}>
      <Link href="/tenants" style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "44px", fontSize: "14px", color: "var(--text-2)", textDecoration: "none", alignSelf: "flex-start" }}>
        <ArrowRight size={16} /> חזרה לדיירים
      </Link>

      {/* ── מי זה ── */}
      <section className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }} data-person={p.id}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div aria-hidden style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#3b82f620", border: "1px solid #3b82f640", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "20px", fontWeight: 800, color: "var(--blue)" }}>
            {name.charAt(0)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>{name}</h1>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
              {deleted && <Tag tone="muted">החשבון נמחק</Tag>}
              {tag && <Tag tone="danger"><Ban size={13} /> {tag}</Tag>}
              {persona && <Tag tone="info">{persona}</Tag>}
              {p.totp_enabled && <Tag tone="ok"><ShieldCheck size={13} /> אימות דו-שלבי פעיל</Tag>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14.5px", color: "var(--text)" }}>
          {p.phone && (
            <a href={canAct ? `tel:${p.phone}` : undefined} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "36px", color: "var(--text)", textDecoration: "none" }}>
              <Phone size={15} color="var(--text-2)" /><bdi dir="ltr">{p.phone}</bdi>
            </a>
          )}
          {p.email && (
            <a href={canAct ? `mailto:${p.email}` : undefined} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "36px", color: "var(--text)", textDecoration: "none" }}>
              <Mail size={15} color="var(--text-2)" /><bdi dir="ltr">{p.email}</bdi>
            </a>
          )}
          <span style={{ color: "var(--text-2)" }}>נרשם/ה ב-{ilDate(p.created_at)}</span>
        </div>

        {blk && !legacyRow && (
          <Banner tone="error">
            <b>החשבון חסום.</b> נחסם ב-<bdi dir="ltr">{ilDate(blk.blocked_at)}</bdi> בשעה <bdi dir="ltr">{ilTime(blk.blocked_at)}</bdi>, על ידי <bdi dir="ltr">{blk.blocked_by}</bdi>. הסיבה: {blk.reason}
          </Banner>
        )}
        {(legacyRow || (legacyStatus && !blk)) && (
          <Banner tone="warn">
            <b>החשבון חסום.</b> הוא נחסם בשיטה הישנה (לפני העדכון), שלא שמרה מתי, על ידי מי ולמה.
            {legacyStatus ? " ביטול החסימה יחזיר אותו כממתין לאישור בבניין הראשי." : ""}
          </Banner>
        )}
        {detail.blocksUnavailable && (
          <Banner tone="info">חסימת חשבון תהיה זמינה אחרי שה-SQL של החבילה (172) ירוץ ב-bloc.</Banner>
        )}

        {canAct && !deleted && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {blocked ? (
              <button type="button" onClick={() => setOpen({ kind: "unblock" })} style={ghostBtn} data-person-unblock="">
                <ShieldCheck size={16} /> ביטול החסימה
              </button>
            ) : !detail.blocksUnavailable && (
              <button type="button" onClick={() => setOpen({ kind: "block" })} style={{ ...ghostBtn, color: "var(--red)", borderColor: "#ef444455" }} data-person-block="">
                <ShieldAlert size={16} /> חסימת החשבון
              </button>
            )}
          </div>
        )}
      </section>

      {done && <Banner tone="ok">{done}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {detail.failed.length > 0 && (
        <Banner tone="warn">חלק מהנתונים לא נטענו: {detail.failed.join(", ")}. מה שמוצג נכון, אבל ייתכן שחסר.</Banner>
      )}

      {/* ── בניינים ── */}
      <Section title="בניינים" hint={live.length ? undefined : "לא חבר/ה באף בניין כרגע."}>
        {live.map((m) => {
          const w = where(m);
          const st = MEMBERSHIP_STATUS[m.status] ?? MEMBERSHIP_STATUS.pending;
          const head = m.role === "admin" && m.building?.founder_id === p.id;
          const primary = p.building_id === m.building_id;
          return (
            <div key={m.id} className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", background: "var(--surface)" }} data-membership={m.building_id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/buildings/${m.building_id}`} style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: 700, color: "var(--text)", textDecoration: "none", minHeight: "32px" }}>
                    <Building2 size={16} color="var(--text-2)" />{w.name}
                  </Link>
                  <div style={{ fontSize: "14.5px", color: "var(--text-2)", marginTop: "2px", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    {head && <Crown size={14} color="#eab308" aria-hidden />}
                    <span>
                      {roleLabel({ role: m.role, userId: p.id, founderId: m.building?.founder_id ?? null, deputy: m.deputy })}
                      {m.apartment ? `, דירה ${m.apartment}` : ""}{m.floor ? `, קומה ${m.floor}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>
                    {m.status === "pending" ? `ביקש/ה להצטרף ב-${ilDate(m.created_at)}` : `חבר/ה מ-${ilDate(m.created_at)}`}{primary ? ". הבניין הראשי" : ""}
                    {m.building?.is_archived ? ". הבניין בארכיון" : m.building?.is_active === false ? ". הבניין מושעה" : ""}
                  </div>
                </div>
                <Tag tone={st.tone === "ok" ? "ok" : st.tone === "wait" ? "wait" : "muted"}>{st.label}</Tag>
              </div>

              {canAct && !deleted && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {m.status === "pending" ? (
                    <>
                      <button type="button" onClick={() => approve(m)} disabled={approving === m.id} style={{ ...ghostBtn, color: "var(--green)", borderColor: "#22c55e55" }} data-membership-approve="">
                        <Check size={16} /> {approving === m.id ? "מאשרים…" : "אישור"}
                      </button>
                      <button type="button" onClick={() => setOpen({ kind: "reject", m })} style={ghostBtn} data-membership-reject=""><X size={16} /> דחייה</button>
                    </>
                  ) : (
                    <>
                      {!persona && (m.role === "admin"
                        ? !head && <button type="button" onClick={() => setOpen({ kind: "demote", m })} style={ghostBtn} data-membership-demote=""><UserMinus size={16} /> הסרה מהוועד</button>
                        : <button type="button" onClick={() => setOpen({ kind: "promote", m })} style={ghostBtn} data-membership-promote=""><UserPlus size={16} /> מינוי לוועד</button>)}
                      <button type="button" onClick={() => setOpen({ kind: "apartment", m })} style={ghostBtn} data-membership-apartment=""><Home size={16} /> דירה וקומה</button>
                      <button type="button" onClick={() => setOpen({ kind: "transfer", m })} style={ghostBtn} data-membership-transfer=""><ArrowLeftRight size={16} /> מעבר לבניין אחר</button>
                      <button type="button" onClick={() => setOpen({ kind: "remove", m })} style={{ ...ghostBtn, color: "var(--red)", borderColor: "#ef444455" }} data-membership-remove=""><UserMinus size={16} /> הסרה מהבניין</button>
                    </>
                  )}
                </div>
              )}
              {canAct && head && (
                <p style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
                  ראש הוועד מוחלף ב<Link href={`/committee?building=${m.building_id}`} style={{ color: "var(--blue)" }}>מסך המשכיות ועד</Link>.
                </p>
              )}
            </div>
          );
        })}
        {past.length > 0 && (
          <div style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.8 }}>
            <b style={{ color: "var(--text)" }}>בניינים קודמים: </b>
            {past.map((m, i) => (
              <span key={m.id}>{i > 0 && ", "}{where(m).name} (עד {ilDate(m.removed_at ?? null)})</span>
            ))}
          </div>
        )}
      </Section>

      {/* ── תשלומים ── */}
      <Section title="תשלומים" hint={detail.payments.length ? "בכל הבניינים, לפי החשבון (לא לפי השם)." : "אין תשלומים בחשבון הזה."}>
        {detail.payments.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="card" style={{ padding: "14px", background: "var(--surface)" }}>
                <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>שולם</div>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text)" }} data-person-paid="">{ils(totals.paid)}</div>
                <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{totals.paidCount} תשלומים</div>
              </div>
              <div className="card" style={{ padding: "14px", background: "var(--surface)", borderColor: totals.debt > 0 ? "#ef444455" : "var(--border)" }}>
                <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>פתוח לתשלום</div>
                <div style={{ fontSize: "24px", fontWeight: 800, color: totals.debt > 0 ? "var(--red)" : "var(--text)" }} data-person-debt="">{ils(totals.debt)}</div>
                <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{totals.debtCount} חיובים</div>
              </div>
            </div>
            {detail.paymentsTruncated && <Banner tone="warn">יש יותר תשלומים ממה שנטען, ולכן הסכומים חלקיים.</Banner>}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {detail.payments.slice(0, 50).map((x) => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14.5px", color: "var(--text)", fontWeight: 600 }}>{(x.title ?? "").trim() || "תשלום"}</div>
                    <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
                      {x.building_id ? detail.buildingNames[x.building_id] ?? "בניין" : "בניין"}, {ilDate(x.paid_at ?? x.created_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{ils(Number(x.amount) || 0)}</div>
                  <Tag tone={x.status === "paid" ? "ok" : x.status === "pending" || x.status === "pending_approval" ? "wait" : "muted"}>{paymentStatusLabel(x.status)}</Tag>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── מה נעשה ── */}
      <Section title="מה נעשה" hint={activity.length ? undefined : "אין פעולות רשומות."}>
        {activity.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", fontSize: "14.5px", lineHeight: 1.6 }}>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{a.label}</span>
            <span style={{ color: "var(--text-2)" }}>
              <bdi>{a.who}</bdi>{a.email ? <> (<bdi dir="ltr">{a.email}</bdi>)</> : null}, <bdi dir="ltr">{ilDateTime(a.at)}</bdi>
            </span>
          </div>
        ))}
      </Section>

      {/* ── חלונות ── */}
      {open?.kind === "reject" && <RejectModal who={who} where={where(open.m)} onClose={() => setOpen(null)} onDone={() => finish(`הבקשה להצטרף ל${where(open.m).name} נדחתה.`)} />}
      {open?.kind === "remove" && (
        <RemoveModal who={who} where={where(open.m)} head={open.m.role === "admin" && open.m.building?.founder_id === p.id}
          onClose={() => setOpen(null)} onDone={() => finish(`${name} הוסר/ה מ${where(open.m).name}.`)} />
      )}
      {(open?.kind === "promote" || open?.kind === "demote") && (
        <RoleModal who={who} where={where(open.m)} to={open.kind === "promote" ? "admin" : "tenant"} onClose={() => setOpen(null)}
          onDone={(d) => finish(open.kind === "promote"
            ? (d.head ? `${name} מונה/תה לראש הוועד ב${where(open.m).name}.` : `${name} מונה/תה לוועד ב${where(open.m).name}.`)
            : `${name} הוסר/ה מהוועד ב${where(open.m).name}.`)} />
      )}
      {open?.kind === "apartment" && (
        <ApartmentModal who={who} where={where(open.m)} apartment={open.m.apartment} floor={open.m.floor} onClose={() => setOpen(null)}
          onDone={() => finish("הדירה והקומה נשמרו.")} />
      )}
      {open?.kind === "transfer" && (
        <TransferModal who={who} from={where(open.m)} buildings={buildings} failed={buildingsFailed} onClose={() => setOpen(null)}
          onDone={(d) => finish(d.approved ? `${name} הועבר/ה לבניין החדש, וההצטרפות אושרה.` : `${name} הועבר/ה לבניין החדש. הוועד שם צריך לאשר.`)} />
      )}
      {open?.kind === "block" && <BlockModal who={who} heads={heads} onClose={() => setOpen(null)} onDone={(d) => finish(d.banned === false
        ? "החשבון נחסם ב-bloc, אבל חסימת הכניסה לא הצליחה. נסו שוב (ביטול וחסימה מחדש)."
        : "החשבון נחסם. הכניסה ל-bloc חסומה בכל הבניינים.")} />}
      {open?.kind === "unblock" && <UnblockModal who={who} legacy={legacyStatus} onClose={() => setOpen(null)} onDone={(d) => finish(d.legacy
        ? "החסימה בוטלה. החשבון חזר כממתין לאישור בבניין הראשי."
        : "החסימה בוטלה. אפשר להיכנס שוב.")} />}
    </div>
  );
}
