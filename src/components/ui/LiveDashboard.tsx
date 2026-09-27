"use client";
// פיד חי — משיכה מ-/api/live כל 15 שניות (לא Realtime עם anon; ראה lib/liveEvents).
import { useState, useRef, useCallback } from "react";
import { Users, Wrench, Bell, RefreshCw, Wifi, WifiOff, Receipt, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { usePoll } from "@/hooks/usePoll";
import { mergeLiveEvents, LIVE_POLL_MS, type LiveEvent } from "@/lib/liveEvents";

interface Stats { pending_approvals: number; open_tickets: number; pending_reports: number; supplier_queue: number }

const TYPE_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  new_tenant:       { bg: "#3b82f618", color: "#3b82f6", icon: "👤" },
  urgent_ticket:    { bg: "#ef444418", color: "#ef4444", icon: "🚨" },
  new_ticket:       { bg: "#eab30818", color: "#eab308", icon: "🔧" },
  declined_payment: { bg: "#ef444418", color: "#ef4444", icon: "💳" },
  webhook_error:    { bg: "#ef444418", color: "#ef4444", icon: "⚠️" },
};

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s / 60)}ד׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)}ש׳`;
  return `לפני ${Math.floor(s / 86400)}י׳`;
}

export default function LiveDashboard() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cursor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const qs = cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : "";
      const r = await fetch(`/api/live${qs}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      cursor.current = j.cursor;
      setStats(j.stats);
      setEvents((prev) => mergeLiveEvents(prev, j.events ?? []));
      setLastOk(new Date().toISOString());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  usePoll(poll, LIVE_POLL_MS);

  const tiles = [
    { label: "דיירים ממתינים", value: stats?.pending_approvals, icon: Users, color: "var(--yellow)", border: "#eab30840", href: "/tenants" },
    { label: "תקלות פתוחות", value: stats?.open_tickets, icon: Wrench, color: "var(--red)", border: "#ef444440", href: "/tickets" },
    { label: "דיווחים לוועד", value: stats?.pending_reports, icon: Receipt, color: "var(--yellow)", border: "#eab30840", href: "/debt" },
    { label: "ספקים לאימות", value: stats?.supplier_queue, icon: BadgeCheck, color: "var(--blue)", border: "#3b82f640", href: "/suppliers" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {failed ? <WifiOff size={14} style={{ color: "var(--red)" }} /> : <Wifi size={14} style={{ color: lastOk ? "var(--green)" : "var(--text-3)" }} />}
          <span style={{ fontSize: "12px", color: failed ? "var(--red)" : lastOk ? "var(--green)" : "var(--text-3)", fontWeight: 500 }}>
            {failed ? "העדכון נכשל — מנסה שוב" : lastOk ? `מתעדכן כל ${LIVE_POLL_MS / 1000} שניות` : "טוען..."}
          </span>
        </div>
        <button onClick={() => void poll()} style={{
          display: "flex", alignItems: "center", gap: "6px", background: "none", border: "1px solid var(--border)",
          borderRadius: "6px", padding: "6px 10px", fontSize: "12px", color: "var(--text-3)", cursor: "pointer",
        }}>
          <RefreshCw size={12} />רענן
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px" }}>
        {tiles.map((t) => {
          const hot = (t.value ?? 0) > 0;
          return (
            <Link key={t.label} href={t.href} style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: "14px", borderColor: hot ? t.border : "var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <t.icon size={14} style={{ color: t.color }} />
                  <span style={{ fontSize: "11px", color: "var(--text-3)", letterSpacing: ".06em" }}>{t.label}</span>
                </div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: hot ? t.color : "var(--text)" }}>{t.value ?? "—"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Bell size={15} style={{ color: "var(--text-2)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>פיד חי · שעה אחרונה ואילך</span>
          </div>
          {lastOk && <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{ago(lastOk)}</span>}
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: "13px", color: "var(--text-3)" }}>אין אירועים חדשים</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>דייר חדש, תקלה, סליקה שנדחתה, שגיאת webhook</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {events.map((ev) => {
              const st = TYPE_STYLE[ev.type] ?? { bg: "#52525b18", color: "#52525b", icon: "•" };
              return (
                <Link key={ev.id} href={ev.href} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "8px", background: st.bg, border: `1px solid ${st.color}20` }}>
                    <span style={{ fontSize: "18px", flexShrink: 0 }}>{st.icon}</span>
                    <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.message}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)", flexShrink: 0 }}>{ago(ev.at)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
