"use client";
// דיירים וועד (bloc UI-R5c-1): שלוש לשוניות — ממתינים לאישור (בקשות בכל הבניינים, גם בניין שני של אדם),
// כל הדיירים והוועד, חסומים. חיפוש ועמודים בשרת (/api/people). כשל — הודעה עם "ניסיון נוסף", לא רשימה ריקה.
// אישור — בלחיצה; דחייה — עם תיעוד. כל השאר — בדף האדם.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, Check, X, ChevronLeft, ChevronRight, Building2, Crown } from "lucide-react";
import { Banner, ghostBtn, Tag, postMember, inputStyle } from "./panelKit";
import { RejectModal, type Who, type Where } from "./memberModals";
import { ilDate, ilTime } from "@/lib/committee";
import { blockTag, isLegacyBlock, type ListItem, type ListResult, type PeopleTab } from "@/lib/people";

type Data = ListResult & { canAct: boolean };

const TABS: { key: PeopleTab; label: string; empty: string }[] = [
  { key: "pending", label: "ממתינים לאישור", empty: "אין בקשות הצטרפות שממתינות." },
  { key: "all", label: "כל הדיירים והוועד", empty: "לא נמצאו דיירים." },
  { key: "blocked", label: "חסומים", empty: "אין חשבונות חסומים." },
];

const nameOf = (it: ListItem) => (it.person.full_name ?? "").trim() || "ללא שם";

export default function PeopleList() {
  const [tab, setTab] = useState<PeopleTab>("pending");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [reject, setReject] = useState<{ who: Who; where: Where } | null>(null);
  const seq = useRef(0);

  // קישור ישיר ללשונית: /tenants?tab=all — בלי useSearchParams (לא דורש Suspense).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "all" || t === "blocked" || t === "pending") setTab(t);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const sp = new URLSearchParams({ tab, page: String(page) });
      if (query) sp.set("q", query);
      const r = await fetch(`/api/people?${sp}`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (mine !== seq.current) return;
      if (!r.ok) { setError(j.error ?? "לא הצלחנו לטעון את הרשימה. נסו שוב."); setData(null); }
      else setData(j as Data);
    } catch {
      if (mine === seq.current) { setError("אין חיבור לשרת. בדקו את החיבור ונסו שוב."); setData(null); }
    }
    if (mine === seq.current) setLoading(false);
  }, [tab, page, query]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (it: ListItem) => {
    const r0 = it.request!;
    setBusy(r0.id); setDone(""); setRowError((e) => ({ ...e, [r0.id]: "" }));
    const r = await postMember({ action: "approve", building_id: r0.building_id, user_id: it.person.id });
    setBusy(null);
    if (!r.ok) { setRowError((e) => ({ ...e, [r0.id]: r.error })); return; }
    setDone(`${nameOf(it)} אושר/ה ב${r0.building?.name ?? "בניין"}.`);
    void load();
  };

  const current = TABS.find((t) => t.key === tab)!;
  const canAct = !!data?.canAct;

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <div className="chips" role="tablist" aria-label="סוג הרשימה">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`chip${tab === t.key ? " active" : ""}`}
              onClick={() => { setTab(t.key); setPage(1); setDone(""); }} style={{ minHeight: "44px", ...(tab === t.key ? {} : { color: "var(--text-2)" }) }} data-people-tab={t.key}>
              {t.label}{tab === t.key && data?.total != null ? ` (${data.total.toLocaleString("he-IL")})` : ""}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} style={ghostBtn} aria-label="רענון"><RefreshCw size={15} /> רענון</button>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-2)" }} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, מייל או טלפון" aria-label="חיפוש"
          style={{ ...inputStyle, paddingRight: "42px" }} data-people-search="" />
      </div>

      {done && <Banner tone="ok">{done}</Banner>}
      {data?.blocksUnavailable && tab === "blocked" && (
        <Banner tone="info">חסימת חשבון בשיטה החדשה תהיה זמינה אחרי שה-SQL של החבילה (172) ירוץ ב-bloc. מוצגים החסומים בשיטה הישנה.</Banner>
      )}
      {data?.truncated && <Banner tone="warn">הרשימה ארוכה מכדי להציג את כולה. חפשו לפי שם.</Banner>}

      {loading && !data && <div className="card" style={{ padding: "20px", color: "var(--text-2)", fontSize: "14.5px" }}>טוען…</div>}
      {error && (
        <Banner tone="error" action={<button type="button" onClick={() => void load()} style={ghostBtn}>ניסיון נוסף</button>}>{error}</Banner>
      )}

      {data && !error && (
        data.items.length === 0
          ? <div className="card" style={{ padding: "24px", color: "var(--text-2)", fontSize: "14.5px" }} data-people-empty={tab}>{query ? "אין תוצאות לחיפוש." : current.empty}</div>
          : (
            <PeopleRows items={data.items} tab={tab} canAct={canAct} busy={busy} rowError={rowError} dim={loading}
              onApprove={approve} onReject={(it) => setReject({ who: { id: it.person.id, name: nameOf(it) }, where: { id: it.request!.building_id, name: it.request!.building?.name ?? "בניין" } })} />
          )
      )}

      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
          <button type="button" onClick={() => setPage((x) => Math.max(1, x - 1))} disabled={page <= 1 || loading} style={ghostBtn} aria-label="העמוד הקודם"><ChevronRight size={16} /></button>
          <span style={{ fontSize: "14px", color: "var(--text-2)" }}>עמוד {page} מתוך {data.pages}</span>
          <button type="button" onClick={() => setPage((x) => Math.min(data.pages, x + 1))} disabled={page >= data.pages || loading} style={ghostBtn} aria-label="העמוד הבא"><ChevronLeft size={16} /></button>
        </div>
      )}

      {reject && (
        <RejectModal who={reject.who} where={reject.where} onClose={() => setReject(null)}
          onDone={() => { setDone(`הבקשה של ${reject.who.name} נדחתה.`); setReject(null); void load(); }} />
      )}
    </div>
  );
}

/** השורות של הרשימה — בלי מצב משלהן (נבדקות ומוצגות בתצוגה המקדימה כמו שהן). */
export function PeopleRows({ items, tab, canAct, busy, rowError, dim, onApprove, onReject }: {
  items: ListItem[]; tab: PeopleTab; canAct: boolean; busy: string | null; rowError: Record<string, string>; dim?: boolean
  onApprove: (it: ListItem) => void; onReject: (it: ListItem) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: dim ? 0.6 : 1 }}>
      {items.map((it) => {
        const key = it.request?.id ?? it.person.id;
        const tag = blockTag({ block: it.block, legacyStatus: it.legacyBlocked });
        return (
          <div key={key} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }} data-people-row={it.person.id}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/tenants/${it.person.id}`} style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", textDecoration: "none", display: "inline-flex", minHeight: "32px", alignItems: "center" }}>
                  {nameOf(it)}
                </Link>
                <div style={{ fontSize: "14px", color: "var(--text-2)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {it.person.phone && <bdi dir="ltr">{it.person.phone}</bdi>}
                  {it.person.email && <bdi dir="ltr">{it.person.email}</bdi>}
                </div>
              </div>
              {tag && <Tag tone="danger">{tag}</Tag>}
            </div>

            {it.request && (
              <div style={{ fontSize: "14.5px", color: "var(--text)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <Building2 size={15} color="var(--text-2)" aria-hidden />
                <Link href={`/buildings/${it.request.building_id}`} style={{ color: "var(--text)", fontWeight: 600 }}>{it.request.building?.name ?? "בניין"}</Link>
                <span style={{ color: "var(--text-2)" }}>
                  {it.request.apartment ? `דירה ${it.request.apartment}, ` : ""}ביקש/ה ב-{ilDate(it.request.created_at)}
                </span>
              </div>
            )}

            {it.memberships.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {it.memberships.map((m) => {
                  const head = m.role === "admin" && m.building?.founder_id === it.person.id;
                  return (
                    <Tag key={m.id} tone={m.status === "pending" ? "wait" : m.role === "admin" ? "info" : "muted"}>
                      {head && <Crown size={12} aria-hidden />}
                      {m.building?.name ?? "בניין"}{m.role === "admin" ? (head ? " (ראש הוועד)" : " (ועד)") : ""}{m.status === "pending" ? " (ממתין/ה)" : ""}
                    </Tag>
                  );
                })}
              </div>
            )}
            {tab === "all" && it.memberships.length === 0 && <div style={{ fontSize: "14px", color: "var(--text-2)" }}>לא חבר/ה באף בניין כרגע.</div>}

            {it.block && (
              <div style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }} data-people-block="">
                {isLegacyBlock(it.block)
                  ? "נחסם/ה בשיטה הישנה, לפני העדכון. מתי, על ידי מי ולמה לא נשמרו."
                  : <>נחסם/ה ב-<bdi dir="ltr">{ilDate(it.block.blocked_at)}</bdi> בשעה <bdi dir="ltr">{ilTime(it.block.blocked_at)}</bdi>, על ידי <bdi dir="ltr">{it.block.blocked_by}</bdi>. הסיבה: {it.block.reason}</>}
              </div>
            )}

            {it.request && canAct && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => onApprove(it)} disabled={busy === it.request.id} style={{ ...ghostBtn, color: "var(--green)", borderColor: "#22c55e55" }} data-people-approve="">
                  <Check size={16} /> {busy === it.request.id ? "מאשרים…" : "אישור"}
                </button>
                <button type="button" onClick={() => onReject(it)}
                  style={ghostBtn} data-people-reject=""><X size={16} /> דחייה</button>
                {rowError[it.request.id] && <span role="alert" style={{ fontSize: "14px", color: "var(--red)" }}>{rowError[it.request.id]}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
