// src/lib/nav.ts — ניווט הפאנל, מקובץ לפי תחום (במקום 16 פריטים שטוחים).
import type { Permission } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; permission?: Permission; superadminOnly?: boolean; badge?: NavBadge };
/** bloc COMPANY-1 (החלטה 654): מונה ליד הפריט — מה שממתין לצוות (/api/nav-counts). */
export type NavBadge = "companies";
export type NavCounts = { companies: number | null; links: number | null };

/** המספר שליד הפריט: חברות שממתינות לאישור + בקשות לבניינים בלי ועד. לא נטען (שניהם null) — null, לא 0. */
export function badgeCount(badge: NavBadge | undefined, counts: NavCounts | null): number | null {
  if (!badge || !counts) return null;
  if (counts.companies === null && counts.links === null) return null;
  return (counts.companies ?? 0) + (counts.links ?? 0);
}
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { title: "סקירה", items: [
    { href: "/overview",  label: "סקירה כללית", icon: "LayoutDashboard" },
    { href: "/live",      label: "חי",           icon: "Radio" },
    { href: "/analytics", label: "אנליטיקה",     icon: "BarChart3" },
  ]},
  { title: "בניינים ואנשים", items: [
    { href: "/buildings",            label: "בניינים",      icon: "Building2", permission: "buildings.read" },
    { href: "/tenants",              label: "דיירים וועד",  icon: "Users",     permission: "tenants.read" },
    { href: "/management-companies", label: "חברות ניהול", icon: "Briefcase", badge: "companies" },
    { href: "/suppliers",            label: "ספקים ואימות", icon: "BadgeCheck" },
    { href: "/committee",            label: "המשכיות ועד",  icon: "UserCheck",   permission: "buildings.read" },
    { href: "/tickets",              label: "תקלות",        icon: "Wrench" },
  ]},
  { title: "כסף", items: [
    { href: "/money",    label: "בקרת כסף",     icon: "ShieldAlert", permission: "payments.read" },
    { href: "/payments", label: "תשלומי דיירים", icon: "CreditCard",  permission: "payments.read" },
    { href: "/collection", label: "ספקי סליקה",  icon: "Landmark",    permission: "payments.read" },
    { href: "/debt",     label: "חובות",         icon: "TrendingDown", permission: "payments.read" },
    { href: "/billing",  label: "מנויים ל-bloc", icon: "Wallet",      superadminOnly: true },
  ]},
  { title: "תקשורת", items: [
    { href: "/broadcast", label: "הודעות לבניינים", icon: "Send", permission: "broadcast.send" },
    { href: "/ads",       label: "פרסומות",          icon: "Megaphone", permission: "ads.read" },
    // bloc HOME-STUDIO-1: כרטיסים של bloc במסך הבית של הדיירים והוועד
    { href: "/home-studio", label: "מסך הבית",       icon: "LayoutTemplate", permission: "home_studio.read" },
    { href: "/stories",   label: "סטורי - מיתון",    icon: "Flag",      permission: "stories.read" },
    { href: "/dm-reports", label: "דיווחים על הודעות פרטיות", icon: "MessageCircle", permission: "dm_reports.read" },
    { href: "/content-reports", label: "דיווחים על תוכן", icon: "Flag", permission: "content_reports.read" },
  ]},
  { title: "מערכת", items: [
    // bloc OPS-1 (שלב 9, החלטה 752): מרכז התפעול — משימות, גיבוי ושחזור, תורים, תקלות וספרי הפעלה
    { href: "/ops",      label: "תפעול",      icon: "Activity", permission: "ops.read" },
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
