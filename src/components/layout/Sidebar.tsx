"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PanelAdmin } from "@/lib/auth";
import {
  LayoutDashboard, Building2, Users, CreditCard, Wrench,
  ScrollText, Settings, LogOut, BarChart3, X, Send, Search, Archive, TrendingDown, ShieldCheck, Radio, Briefcase,
} from "lucide-react";

const NAV = [
  { href:"/overview",  label:"סקירה כללית", icon:LayoutDashboard },
  { href:"/buildings", label:"בניינים",      icon:Building2 },
  { href:"/tenants",   label:"דיירים",       icon:Users },
  { href:"/payments",  label:"תשלומים",      icon:CreditCard },
  { href:"/tickets",   label:"תקלות",        icon:Wrench },
  { href:"/analytics", label:"אנליטיקה",     icon:BarChart3 },
  { href:"/live",      label:"חי",         icon:Radio },
  { href:"/debt",      label:"חובות",         icon:TrendingDown },
  { href:"/logs",      label:"לוג פעולות",   icon:ScrollText },
  { href:"/broadcast", label:"שליחת הודעה",  icon:Send },
  { href:"/search",    label:"חיפוש",         icon:Search },
  { href:"/archive",   label:"ארכיב",         icon:Archive },
  { href:"/security",  label:"אבטחה",         icon:ShieldCheck },
  { href:"/management-companies", label:"חברות ניהול", icon:Briefcase },
  { href:"/settings",  label:"הגדרות",       icon:Settings },
];

interface Props { admin: PanelAdmin; isOpen: boolean; onClose: () => void; }

export default function Sidebar({ admin, isOpen, onClose }: Props) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside style={{
      width: "280px",
      flexShrink: 0,
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      transition: "transform .28s cubic-bezier(.16,1,.3,1)",
    }}
    className={!isOpen ? "sidebar closed" : "sidebar"}>

      {/* Header */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "var(--bg)", fontWeight: "800", fontSize: "14px", fontFamily: "var(--mono)" }}>B</span>
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.02em" }}>blocpanel</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px", fontFamily: "var(--mono)" }}>super admin</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "var(--text-3)",
          padding: "6px", cursor: "pointer", borderRadius: "6px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
        <div style={{ marginBottom: "6px", padding: "8px 10px", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          ניווט
        </div>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: "13px",
              padding: "12px 12px", borderRadius: "9px", marginBottom: "2px",
              color: active ? "var(--text)" : "var(--text-3)",
              background: active ? "var(--card)" : "transparent",
              border: `1px solid ${active ? "var(--border-2)" : "transparent"}`,
              fontWeight: active ? "600" : "400",
              fontSize: "15px", transition: "all .15s",
              textDecoration: "none",
            }}>
              <Icon size={18} strokeWidth={active ? 2.2 : 1.7} style={{ flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: "12px", borderTop: "1px solid var(--border)" }}>
        <div style={{
          padding: "12px 14px", borderRadius: "10px",
          background: "var(--card)", border: "1px solid var(--border)",
          marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "#3b82f620", border: "1px solid #3b82f640",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--blue)" }}>{admin.full_name.charAt(0)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{admin.full_name}</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{admin.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          display: "flex", alignItems: "center", gap: "10px", width: "100%",
          padding: "11px 12px", borderRadius: "9px", border: "none",
          background: "transparent", color: "var(--text-3)",
          fontSize: "15px", cursor: "pointer", transition: "all .15s",
        }}
          onMouseEnter={e => { (e.currentTarget).style.color = "var(--red)"; (e.currentTarget).style.background = "#ef444412"; }}
          onMouseLeave={e => { (e.currentTarget).style.color = "var(--text-3)"; (e.currentTarget).style.background = "transparent"; }}>
          <LogOut size={17} strokeWidth={1.7} />
          התנתקות
        </button>
      </div>
    </aside>
  );
}
