// dmReports/DmReportsQueue — MOD-1 (bloc MG-S1179): התור של הדיווחים על הודעות פרטיות. בלי שום תוכן ברשימה: מי דיווח על מי,
// באיזה בניין, הסיבה, מתי, כמה הודעות (כמה אומתו) וכמה קבצים, והיעד לבדיקה (SLA לפי הסיבה). הסינון — בכתובת (מצב, סיבה, בניין,
// אדם, סדר), כך שקישור מדף אחר ("כל הדיווחים על…") פותח בדיוק את הרשימה. כל דיווח נפתח בדף משלו — הפתיחה נרשמת, ולכן בלי
// prefetch (רק לחיצה פותחת). התצוגה בלי hooks (נבדקת ומצולמת כמו שהיא); הנתונים — DmReportsQueueClient (מ-/api/, לא ב-HTML).
import Link from "next/link";
import { Banner, Tag, ghostBtn } from "@/components/ui/panelKit";
import { Initials, REASON_TONE, SLA_TONE } from "@/components/dmReports/kit";
import {
  DM_EMPTY_FILTERED_TEXT, DM_EMPTY_TEXT, DM_FAILED_TEXT, DM_LIST_MAX, DM_PRIVACY_TEXT, DM_REASONS, DM_REASON_LABEL, DM_SLA_TEXT, DM_SQL_MISSING_TEXT,
  agoText, countsText, dmQueueHref, dmSla, type DmFilter, type DmReportItem,
} from "@/lib/dmReports";
import type { DmQueueData } from "@/lib/dmReportsServer";


const chip = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "99px", fontSize: "14px", fontWeight: 600,
  border: `1px solid ${active ? "var(--text)" : "var(--border)"}`, background: active ? "var(--text)" : "transparent", color: active ? "var(--bg)" : "var(--text-2)",
  textDecoration: "none", whiteSpace: "nowrap",
});

function Row({ r, now }: { r: DmReportItem; now: number }) {
  const sla = dmSla(r, now);
  const who = r.reporter?.name ?? "חשבון שנמחק";
  const whom = r.reported?.name ?? "חשבון שנמחק";
  return (
    <Link href={`/dm-reports/${r.id}`} prefetch={false} data-dm-row={r.status} data-dm-sla={sla?.level ?? "none"}
      style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", border: `1px solid ${sla?.level === "late" ? "#ef444466" : "var(--border)"}`,
        color: "var(--text)", textDecoration: "none" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {sla ? <Tag tone={SLA_TONE[sla.level]}>{sla.text}</Tag> : <Tag tone="ok">נבדק {r.reviewed_at ? agoText(r.reviewed_at, now) : ""}</Tag>}
        <Tag tone={REASON_TONE[r.reason]}>{DM_REASON_LABEL[r.reason]}</Tag>
        {r.has_note && <Tag tone="info">עם הערה</Tag>}
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", minWidth: 0 }}>
        <Initials name={whom} />
        <div style={{ minWidth: 0, fontSize: "15px", lineHeight: 1.5 }}>
          <bdi style={{ fontWeight: 700 }}>{whom}</bdi>
          <span style={{ color: "var(--text-2)" }}> · המדווח/ת: <bdi>{who}</bdi></span>
        </div>
      </div>
      <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
        <bdi>{r.building?.name ?? "בלי בניין"}</bdi> · {agoText(r.created_at, now)} · {countsText(r.counts)}
      </div>
    </Link>
  );
}

export function DmReportsQueueView({ data, filter, now, onRetry }: { data: DmQueueData | { state: "loading" }; filter: DmFilter; now: number; onRetry?: () => void }) {
  const head = (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 800 }}>דיווחים על הודעות פרטיות</h1>
      <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }} data-dm-privacy="">{DM_PRIVACY_TEXT}</p>
    </div>
  );
  if (data.state === "missing") return <>{head}<Banner tone="warn">{DM_SQL_MISSING_TEXT}</Banner></>;
  const filtered = !!(filter.reason || filter.building || filter.person);
  // המספר — כל הפתוחים; ליד רשימה מסוננת הוא היה נראה כמו מספר השורות שלה (סקירת MOD-1 #13), ולכן רק בלי סינון
  const tabs = (
    <nav aria-label="מצב" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} data-dm-tabs="">
      {(["open", "reviewed", "all"] as const).map((s) => (
        <Link key={s} href={dmQueueHref(filter, { status: s })} prefetch={false} style={chip(filter.status === s)} aria-current={filter.status === s ? "page" : undefined}>
          {s === "open" ? `פתוחים${data.state === "ok" && data.openTotal !== null && !filtered ? ` (${data.openTotal})` : ""}` : s === "reviewed" ? "נבדקו" : "הכל"}
        </Link>
      ))}
    </nav>
  );
  const filters = (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-dm-filters="">
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <Link href={dmQueueHref(filter, { reason: null })} prefetch={false} style={chip(!filter.reason)} aria-current={!filter.reason ? "true" : undefined}>כל הסיבות</Link>
        {DM_REASONS.map((x) => (
          <Link key={x} href={dmQueueHref(filter, { reason: x })} prefetch={false} style={chip(filter.reason === x)} aria-current={filter.reason === x ? "true" : undefined} data-dm-reason={x}>{DM_REASON_LABEL[x]}</Link>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <Link href={dmQueueHref(filter, { order: "oldest" })} prefetch={false} style={chip(filter.order === "oldest")} aria-current={filter.order === "oldest" ? "true" : undefined} data-dm-order="oldest">הישנים קודם</Link>
        <Link href={dmQueueHref(filter, { order: "newest" })} prefetch={false} style={chip(filter.order === "newest")} aria-current={filter.order === "newest" ? "true" : undefined} data-dm-order="newest">החדשים קודם</Link>
        {filter.building && <Link href={dmQueueHref(filter, { building: null })} prefetch={false} style={chip(true)} data-dm-clear="building">בניין אחד ✕</Link>}
        {filter.person && <Link href={dmQueueHref(filter, { person: null })} prefetch={false} style={chip(true)} data-dm-clear="person">על אדם אחד ✕</Link>}
      </div>
    </div>
  );
  if (data.state === "error") {
    return (
      <>{head}{tabs}
        <Banner tone="error" action={onRetry
          ? <button type="button" style={ghostBtn} onClick={onRetry} data-dm-retry="">נסו שוב</button>
          : <Link href={dmQueueHref(filter)} prefetch={false} style={{ color: "var(--blue)", fontWeight: 600 }}>נסו שוב</Link>}>
          {DM_FAILED_TEXT}{data.message ? ` ${data.message}` : ""}
        </Banner>
      </>
    );
  }
  if (data.state === "loading") {
    return (
      <>{head}{tabs}
        <section className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }} aria-busy="true" data-dm-loading="">
          {filters}
          <div style={{ color: "var(--text-2)", fontSize: "14px" }}>טוענים את הדיווחים…</div>
        </section>
      </>
    );
  }
  const open = data.items.filter((r) => r.status === "open");
  const late = open.filter((r) => dmSla(r, now)?.level === "late").length;
  const soon = open.filter((r) => dmSla(r, now)?.level === "soon").length;
  return (
    <>
      {head}
      {tabs}
      <section className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {filters}
        <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }} data-dm-sla-text="">
          {DM_SLA_TEXT}{open.length ? ` כאן: ${late ? `${late} באיחור` : "אין באיחור"}${soon ? `, ${soon} בקרוב` : ""}.` : ""}
        </p>
        {data.items.length === 0
          ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-dm-empty="">{filtered || filter.status !== "open" ? DM_EMPTY_FILTERED_TEXT : DM_EMPTY_TEXT}</div>
          : data.items.map((r) => <Row key={r.id} r={r} now={now} />)}
        {data.truncated && <p style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-dm-truncated="">מוצגים {DM_LIST_MAX} הראשונים לפי הסדר שנבחר. אפשר לסנן לפי סיבה כדי לראות את השאר.</p>}
      </section>
    </>
  );
}
