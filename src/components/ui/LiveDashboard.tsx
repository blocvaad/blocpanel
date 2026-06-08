"use client";
import { useState, useEffect, useCallback } from "react";
import { useRealtime } from "@/hooks/useRealtime";
import { Users, Wrench, Bell, RefreshCw, Wifi } from "lucide-react";
import Link from "next/link";

interface LiveEvent {
  id: string;
  type: string;
  table: string;
  message: string;
  time: Date;
  href?: string;
}

interface Stats {
  total_tenants: number;
  pending_approvals: number;
  open_tickets: number;
  failed_payments: number;
}

export default function LiveDashboard() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const addEvent = useCallback((e: LiveEvent) => {
    setEvents(prev => [e, ...prev].slice(0, 20));
    setLastUpdate(new Date());
  }, []);

  async function fetchStats() {
    const res = await fetch("/api/stats", { credentials: "include" });
    const j = await res.json();
    setStats(j.data);
  }

  useEffect(() => {
    fetchStats();
    setConnected(true);
  }, []);

  // Watch new tenants
  useRealtime("profiles", (e) => {
    if (e.type === "INSERT") {
      addEvent({
        id: Date.now().toString(),
        type: "new_tenant",
        table: "profiles",
        message: `דייר חדש: ${(e.record.full_name as string) ?? "לא ידוע"} ממתין לאישור`,
        time: new Date(),
        href: "/tenants",
      });
      fetchStats();
    }
  });

  // Watch urgent tickets
  useRealtime("service_tickets", (e) => {
    if (e.type === "INSERT") {
      const urgency = e.record.urgency as string;
      const isUrgent = urgency === "high" || urgency === "urgent";
      addEvent({
        id: Date.now().toString(),
        type: isUrgent ? "urgent_ticket" : "new_ticket",
        table: "service_tickets",
        message: `${isUrgent ? "🚨 תקלה דחופה" : "תקלה חדשה"}: ${(e.record.title as string) ?? ""}`,
        time: new Date(),
        href: "/tickets",
      });
      fetchStats();
    }
  });

  // Watch failed payments
  useRealtime("payments", (e) => {
    if (e.type === "INSERT" || e.type === "UPDATE") {
      if (e.record.status === "failed") {
        addEvent({
          id: Date.now().toString(),
          type: "failed_payment",
          table: "payments",
          message: `תשלום נכשל: ₪${e.record.amount ?? 0}`,
          time: new Date(),
          href: "/payments",
        });
        fetchStats();
      }
    }
  });

  const TYPE_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
    new_tenant:     { bg: "#3b82f618", color: "#3b82f6", icon: "👤" },
    urgent_ticket:  { bg: "#ef444418", color: "#ef4444", icon: "🚨" },
    new_ticket:     { bg: "#eab30818", color: "#eab308", icon: "🔧" },
    failed_payment: { bg: "#ef444418", color: "#ef4444", icon: "💳" },
  };

  function ago(d: Date) {
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "עכשיו";
    if (s < 3600) return `לפני ${Math.floor(s/60)}ד׳`;
    return `לפני ${Math.floor(s/3600)}ש׳`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Connection status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Wifi size={14} style={{ color: connected ? "var(--green)" : "var(--red)" }} />
          <span style={{ fontSize: "12px", color: connected ? "var(--green)" : "var(--red)", fontWeight: "500" }}>
            {connected ? "מחובר בזמן אמת" : "מתחבר..."}
          </span>
        </div>
        <button onClick={fetchStats} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "none", border: "1px solid var(--border)",
          borderRadius: "6px", padding: "6px 10px",
          fontSize: "12px", color: "var(--text-3)", cursor: "pointer",
        }}>
          <RefreshCw size={12} />רענן
        </button>
      </div>

      {/* Live stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div className="card" style={{ padding: "14px", borderColor: (stats?.pending_approvals ?? 0) > 0 ? "#eab30840" : "var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Users size={14} style={{ color: "var(--blue)" }} />
            <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>ממתינים</span>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: (stats?.pending_approvals ?? 0) > 0 ? "var(--yellow)" : "var(--text)" }}>
            {stats?.pending_approvals ?? "—"}
          </div>
        </div>
        <div className="card" style={{ padding: "14px", borderColor: (stats?.open_tickets ?? 0) > 0 ? "#ef444440" : "var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Wrench size={14} style={{ color: "var(--red)" }} />
            <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>תקלות פתוחות</span>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: (stats?.open_tickets ?? 0) > 0 ? "var(--red)" : "var(--text)" }}>
            {stats?.open_tickets ?? "—"}
          </div>
        </div>
      </div>

      {/* Live feed */}
      <div className="card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Bell size={15} style={{ color: "var(--text-2)" }} />
            <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>פיד חי</span>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
            {ago(lastUpdate)}
          </span>
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>👁️</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)" }}>מאזין לאירועים חדשים...</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>כניסת דייר, תקלה, תשלום</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {events.map(ev => {
              const style = TYPE_STYLE[ev.type] ?? { bg: "#52525b18", color: "#52525b", icon: "•" };
              return (
                <Link key={ev.id} href={ev.href ?? "#"} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 12px", borderRadius: "8px",
                    background: style.bg, border: `1px solid ${style.color}20`,
                    transition: "opacity .15s",
                  }}>
                    <span style={{ fontSize: "18px", flexShrink: 0 }}>{style.icon}</span>
                    <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.message}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)", flexShrink: 0 }}>{ago(ev.time)}</span>
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
