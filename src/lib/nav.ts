// src/lib/nav.ts — ניווט הפאנל, מקובץ לפי תחום (במקום 16 פריטים שטוחים).
import type { Permission } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; permission?: Permission; superadminOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { title: "סקירה", items: [
    { href: "/overview",  label: "סקירה כללית", icon: "LayoutDashboard" },
    { href: "/live",      label: "חי",           icon: "Radio" },
    { href: "/analytics", label: "אנליטיקה",     icon: "BarChart3" },
  ]},
  { title: "בניינים ואנשים", items: [
    { href: "/buildings",            label: "בניינים",      icon: "Building2", permission: "buildings.read" },
    { href: "/tenants",              label: "דיירים",       icon: "Users",     permission: "tenants.read" },
    { href: "/management-companies", label: "חברות ניהול", icon: "Briefcase" },
    { href: "/suppliers",            label: "ספקים ואימות", icon: "BadgeCheck" },
    { href: "/tickets",              label: "תקלות",        icon: "Wrench" },
  ]},
  { title: "כסף", items: [
    { href: "/money",    label: "בקרת כסף",     icon: "ShieldAlert", permission: "payments.read" },
    { href: "/payments", label: "תשלומי דיירים", icon: "CreditCard",  permission: "payments.read" },
    { href: "/debt",     label: "חובות",         icon: "TrendingDown", permission: "payments.read" },
    { href: "/billing",  label: "מנויים ל-bloc", icon: "Wallet",      superadminOnly: true },
  ]},
  { title: "תקשורת", items: [
    { href: "/broadcast", label: "שליחת הודעה", icon: "Send", permission: "broadcast.send" },
  ]},
  { title: "מערכת", items: [
    { href: "/search",   label: "חיפוש",      icon: "Search" },
    { href: "/security", label: "אבטחה",      icon: "ShieldCheck" },
    { href: "/logs",     label: "לוג פעולות", icon: "ScrollText" },
    { href: "/archive",  label: "ארכיב",      icon: "Archive" },
    { href: "/settings", label: "הגדרות",     icon: "Settings" },
  ]},
];

/** כותרת לסרגל העליון — הפריט עם ה-prefix הארוך ביותר שמתאים לנתיב. */
export function pageTitle(pathname: string): string {
  let best: { href: string; label: string } | null = null;
  for (const g of NAV_GROUPS) for (const it of g.items) {
    const hit = pathname === it.href || pathname.startsWith(it.href + "/");
    if (hit && (!best || it.href.length > best.href.length)) best = it;
  }
  return best?.label ?? "פאנל";
}
