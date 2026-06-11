"use client";
import type { PanelAdmin } from "@/lib/auth";
import { Bell, Menu, X, CheckCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TITLES: Record<string, string> = {
  "/overview":  "סקירה כללית",
  "/buildings": "בניינים",
  "/tenants":   "דיירים",
  "/payments":  "תשלומים",
  "/tickets":   "תקלות",
  "/analytics": "אנליטיקה",
  "/logs":      "לוג פעולות",
  "/settings":  "הגדרות",
  "/live":      "לוח מחוונים חי",
  "/debt":      "סטטיסטיקת חובות",
  "/broadcast": "שליחת הודעה",
  "/search":    "חיפוש",
  "/archive":   "ארכיב",
  "/security":  "אבטחה",
};

interface Notif { id: string; type: string; title: string; content: string; link: string | null; is_read: boolean; created_at: string; }

function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `${Math.floor(s / 60)}ד׳`;
  if (s < 86400) return `${Math.floor(s / 3600)}ש׳`;
  return `${Math.floor(s / 86400)}י׳`;
}

const ICONS: Record<string, string> = { payment: "₪", ticket: "🔧", announcement: "📢", maintenance: "🛠️" };

export default function TopBar({ admin, onMenuClick }: { admin: PanelAdmin; onMenuClick: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = Object.entries(TITLES).find(([k]) => pathname.startsWith(k))?.[1] ?? "פנאל";
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifs.filter(n => !n.is_read).length;

  async function fetchNotifs() {
    setLoading(true);
    try {
      const r = await fetch("/api/notifications");
      const j = await r.json();
      setNotifs(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  // Initial fetch + Realtime subscription
  useEffect(() => {
    fetchNotifs();

    const channel = supabase
      .channel("panel-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "panel_notifications" },
        (payload) => {
          const n = payload.new as Notif;
          setNotifs(prev => [n, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifs(p => p.map(n => ({ ...n, is_read: true })));
  }

  return (
    <header style={{
      height: "52px", display: "flex", alignItems: "center",
      padding: "0 16px", gap: "12px", flexShrink: 0,
      background: "var(--surface)", borderBottom: "1px solid var(--border)",
    }}>
      <button onClick={onMenuClick} style={{
        display: "flex", width: "40px", height: "40px", border: "1px solid var(--border)",
        borderRadius: "8px", background: "transparent", color: "var(--text-2)",
        alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
      }}>
        <Menu size={16} />
      </button>

      <div style={{ flex: 1 }}>
        <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", letterSpacing: "-.02em" }}>{title}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--green)", fontFamily: "var(--mono)" }}>
        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--green)", display: "inline-block" }} className="pulse-dot" />
        live
      </div>

      <div style={{ position: "relative" }} ref={ref}>
        <button onClick={() => { setOpen(!open); if (!open) fetchNotifs(); }} style={{
          width: "34px", height: "34px", borderRadius: "8px",
          border: "1px solid var(--border)", background: open ? "var(--card)" : "transparent",
          color: unread > 0 ? "var(--text)" : "var(--text-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", transition: "all .15s",
        }}>
          <Bell size={15} strokeWidth={1.8} />
          {unread > 0 && (
            <span style={{
              position: "absolute", top: "-5px", right: "-5px",
              minWidth: "17px", height: "17px", borderRadius: "99px",
              background: "var(--red)", color: "white", fontSize: "9px",
              fontWeight: "700", display: "flex", alignItems: "center",
              justifyContent: "center", padding: "0 4px",
              border: "2px solid var(--surface)",
            }}>{unread > 9 ? "9+" : unread}</span>
          )}
        </button>

        {open && (
          <div className="fade-in" style={{
            position: "absolute", left: "0", top: "calc(100% + 8px)",
            width: "340px", borderRadius: "12px", zIndex: 50, overflow: "hidden",
            background: "var(--surface)", border: "1px solid var(--border)",
            boxShadow: "0 24px 64px rgba(0,0,0,.7)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>התראות</span>
                {unread > 0 && <span style={{ fontSize: "10px", background: "var(--border)", color: "var(--text-2)", padding: "1px 7px", borderRadius: "99px" }}>{unread}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {unread > 0 && (
                  <button onClick={markAll} style={{ fontSize: "11px", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}>
                    <CheckCheck size={11} />סמן הכל
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}><X size={14} /></button>
              </div>
            </div>
            <div style={{ maxHeight: "360px", overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>טוען...</div>
              ) : notifs.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔔</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>אין התראות</div>
                </div>
              ) : notifs.map(n => (
                <div key={n.id}
                  onClick={() => { if (n.link) router.push(n.link); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "12px",
                    padding: "12px 16px", cursor: "pointer", transition: "background .1s",
                    background: n.is_read ? "transparent" : "#3b82f608",
                    borderBottom: "1px solid var(--border)",
                  }}>
                  <div style={{
                    width: "30px", height: "30px", borderRadius: "7px",
                    background: "var(--card)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", flexShrink: 0,
                  }}>
                    {ICONS[n.type] ?? "🔔"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.content}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "4px", fontFamily: "var(--mono)" }}>{ago(n.created_at)}</div>
                  </div>
                  {!n.is_read && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--blue)", flexShrink: 0, marginTop: "5px" }} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
