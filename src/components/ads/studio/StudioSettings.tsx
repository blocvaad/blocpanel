"use client";
// studio/StudioSettings — הגדרות הסטודיו (bloc ADS-1; ADS-2א v2): המתג לכל המערכת (עם אישור ברור לפני שמכבים / מדליקים),
// מכשירי בדיקה (מיילים), בניינים בלי פרסומות, הכללים הקבועים (לקריאה), ו"למה משתמש לא רואה פרסומת?". הכל דרך bloc (settings.save).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Power, Search, X } from "lucide-react";
import { Section, Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds } from "../adsKit";
import type { AdBuildingOption, AdSettingsView } from "@/lib/adsServer";
import { StudioNav, STUDIO_CSS } from "./kit";
import ExplainBox from "./ExplainBox";

/** הכללים הקבועים (החלטות 74, 377–379) — נאכפים ב-bloc בכל הצגה; כאן לקריאה. */
export const FIXED_RULES: Array<{ key: string; text: string }> = [
  { key: "full", text: "מעל המסך (כרטיס, חלון קופץ, מסך מלא, סטורי): פרסומת אחת ביום לכל משתמש לכל היותר, ולפחות 6 שעות בין שתיים." },
  { key: "banner", text: "פס: עד 4 ביום, ולפחות 30 דקות בין שניים. פס שנסגר ב-X לא חוזר לאותו משתמש באותו קמפיין עד סוף היום." },
  { key: "inline", text: "ברשימה (כרטיס ברשימה, קרוסלה): עד 3 ביום, לפחות 10 דקות בין שתיים, ואחת לכל היותר בכל כניסה למסך." },
  { key: "views", text: "נספרת רק פרסומת שהוצגה בפועל. פס ופרסומת ברשימה — רק אחרי שלפחות חצי מהם היה על המסך שנייה רצופה." },
  { key: "new", text: "משתמש חדש — 3 ימים בלי פרסומות." },
  { key: "where", text: "רק במסך הבית, בלוח הקהילתי ובלוח האירועים. אף פעם בתשלום, בחירום, בכניסה, בהצטרפות או כשטופס פתוח." },
  { key: "urgent", text: "בניין עם הודעה דחופה (חירום) ב-24 השעות האחרונות — בלי פרסומות." },
  { key: "close", text: "מסומנות \"ממומן\" עם שם המפרסם, ותמיד אפשר לסגור מיד — כפתור X אטום בפינה, בלי ספירה. בחלון קופץ — גם הקשה מחוץ לחלון." },
  { key: "plans", text: "ברירת המחדל: בניינים במסלול התנסות ו-Core. מסלול בתשלום גבוה יותר — רק כשהקמפיין בוחר בו." },
  { key: "never", text: "חברות ניהול וספקים — אף פעם." },
];

export function KillSwitchView({ enabled, canManage, confirming, busy, updatedBy, onAsk, onConfirm, onCancel }: {
  enabled: boolean; canManage: boolean; confirming: boolean; busy: boolean; updatedBy: string | null;
  onAsk: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-kill-switch={enabled ? "on" : "off"}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: "44px", height: "44px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: enabled ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.14)", color: enabled ? "var(--green)" : "var(--red)" }}>
          <Power size={22} />
        </span>
        {/* the words take at least 180px — on a phone the button drops under them instead of squeezing them */}
        <span style={{ flex: "1 1 180px", minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>{enabled ? "הפרסומות פועלות" : "הפרסומות כבויות"}</span>
          <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)" }}>{enabled ? "דיירים רואים פרסומות לפי הקמפיינים והכללים." : "אף דייר לא רואה פרסומת, גם כשיש קמפיינים פעילים."}{updatedBy ? ` עודכן לאחרונה על ידי ${updatedBy}.` : ""}</span>
        </span>
        {canManage && !confirming && (
          <button type="button" onClick={onAsk} disabled={busy} data-kill-ask="" style={enabled ? { ...ghostBtn, color: "var(--red)", borderColor: "rgba(239,68,68,.5)" } : solidBtn("#16a34a")}>
            {enabled ? "כיבוי כל הפרסומות" : "הפעלת הפרסומות"}
          </button>
        )}
        {!canManage && <Tag tone={enabled ? "ok" : "danger"}>{enabled ? "פועלות" : "כבויות"}</Tag>}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="אישור" data-kill-confirm={enabled ? "off" : "on"}
          style={{ padding: "12px 14px", borderRadius: "12px", border: `1px solid ${enabled ? "rgba(239,68,68,.5)" : "rgba(34,197,94,.5)"}`, background: enabled ? "rgba(239,68,68,.08)" : "rgba(34,197,94,.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }}>
            {enabled
              ? "לכבות את כל הפרסומות? מהרגע הזה אף דייר בשום בניין לא יראה פרסומת — גם בקמפיינים פעילים ששולם עליהם. אפשר להדליק שוב בכל רגע."
              : "להדליק את הפרסומות? קמפיינים פעילים יתחילו להופיע לדיירים מיד, לפי הכללים."}
          </span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={onConfirm} disabled={busy} data-kill-yes="" style={solidBtn(enabled ? "#dc2626" : "#16a34a")}>{busy ? "שומרים…" : enabled ? "כן, לכבות" : "כן, להדליק"}</button>
            <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn} data-kill-no="">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudioSettings({ settings, buildings, canManage, today }: { settings: AdSettingsView; buildings: AdBuildingOption[]; canManage: boolean; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [emails, setEmails] = useState<string[]>(settings.testers.map((t) => t.email ?? "").filter(Boolean));
  const [newEmail, setNewEmail] = useState("");
  const [excluded, setExcluded] = useState<string[]>(settings.excluded_buildings);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const matches = q.trim().length >= 2 ? buildings.filter((b) => !excluded.includes(b.id) && `${b.name} ${b.city ?? ""}`.includes(q.trim())).slice(0, 8) : [];
  const testersDirty = emails.join() !== settings.testers.map((t) => t.email ?? "").filter(Boolean).join();
  const excludedDirty = [...excluded].sort().join() !== [...settings.excluded_buildings].sort().join();

  async function save(key: string, body: Record<string, unknown>, msg: string) {
    if (busy) return;
    setBusy(key); setErr(null); setNotice(null);
    const r = await postAds({ action: "settings.save", ...body });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setConfirming(false); setNotice(msg); router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-studio-settings="">
      <style>{STUDIO_CSS}</style>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>הגדרות</h1>
        <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>המתג לכל המערכת, מכשירי בדיקה, בניינים בלי פרסומות והכללים.</p>
      </div>
      <StudioNav active="settings" />
      {notice && <Banner tone="ok"><span data-ads-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-ads-error="">{err}</span></Banner>}
      <Section title="הפרסומות במערכת" hint="מתג אחד לכל הבניינים — משפיע מיד.">
        <KillSwitchView enabled={settings.enabled} canManage={canManage} confirming={confirming} busy={busy === "enabled"} updatedBy={settings.updated_by}
          onAsk={() => setConfirming(true)} onCancel={() => setConfirming(false)}
          onConfirm={() => void save("enabled", { enabled: !settings.enabled }, settings.enabled ? "הפרסומות כובו." : "הפרסומות הופעלו.")} />
      </Section>

      <Section title="מכשירי בדיקה" hint="חשבונות bloc שרואים תצוגה מקדימה: הקמפיין שעודכן אחרון (טיוטה קודם), בלי מגבלות תדירות, תזמון ומיקוד — ושום דבר לא נספר.">
        {emails.length === 0 && <p style={{ fontSize: "14px", color: "var(--text-2)" }}>אין מכשירי בדיקה.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} data-ads-testers="">
          {emails.map((e) => {
            const t = settings.testers.find((x) => x.email === e);
            return (
              <span key={e} style={pill}>
                <span dir="ltr">{e}</span>{t?.name ? <span style={{ color: "var(--text-2)" }}>{t.name}</span> : null}
                {canManage && <button type="button" aria-label={`הסרת ${e}`} onClick={() => setEmails(emails.filter((x) => x !== e))} style={pillX}><X size={15} /></button>}
              </span>
            );
          })}
        </div>
        {canManage && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <input value={newEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)} type="email" dir="ltr" placeholder="email@example.com" aria-label="מייל של מכשיר בדיקה"
              style={{ ...inputStyle, flex: "1 1 220px", width: "auto" }} data-ads-tester-input="" />
            <button type="button" style={ghostBtn} disabled={!/^\S+@\S+\.\S+$/.test(newEmail.trim()) || emails.length >= 20}
              onClick={() => { const e = newEmail.trim().toLowerCase(); if (!emails.includes(e)) setEmails([...emails, e]); setNewEmail(""); }} data-ads-tester-add=""><Plus size={15} />הוספה</button>
            <button type="button" style={{ ...solidBtn("var(--blue)"), opacity: testersDirty ? 1 : 0.6 }} disabled={!testersDirty || !!busy}
              onClick={() => void save("testers", { tester_emails: emails }, "מכשירי הבדיקה נשמרו.")} data-ads-save-testers="">{busy === "testers" ? "שומרים…" : "שמירת הרשימה"}</button>
          </div>
        )}
      </Section>

      <Section title="בניינים בלי פרסומות" hint="לא מקבלים פרסומות בכלל, גם כשקמפיין מכוון אליהם (בניין תדמית, פיילוט, בקשה מיוחדת).">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} data-ads-excluded={excluded.length}>
          {excluded.length === 0 && <span style={{ fontSize: "14px", color: "var(--text-2)" }}>אין.</span>}
          {excluded.map((id) => (
            <span key={id} style={pill}>{byId.get(id)?.name ?? "בניין שנמחק"}
              {canManage && <button type="button" aria-label="הסרה מהרשימה" onClick={() => setExcluded(excluded.filter((x) => x !== id))} style={pillX}><X size={15} /></button>}
            </span>
          ))}
        </div>
        {canManage && (
          <>
            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
              <input value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="חיפוש בניין לפי שם או עיר" aria-label="חיפוש בניין"
                style={{ ...inputStyle, paddingRight: "36px" }} data-ads-building-search="" />
            </div>
            {matches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {matches.map((b) => (
                  <button key={b.id} type="button" onClick={() => { setExcluded([...excluded, b.id]); setQ(""); }} style={{ ...ghostBtn, justifyContent: "flex-start" }} data-ads-building-option={b.id}>
                    {b.name}{b.city ? <span style={{ color: "var(--text-2)" }}> {b.city}</span> : null}
                  </button>
                ))}
              </div>
            )}
            <div>
              <button type="button" style={{ ...solidBtn("var(--blue)"), opacity: excludedDirty ? 1 : 0.6 }} disabled={!excludedDirty || !!busy}
                onClick={() => void save("excluded", { excluded_buildings: excluded }, "רשימת הבניינים נשמרה.")} data-ads-save-excluded="">{busy === "excluded" ? "שומרים…" : "שמירת הרשימה"}</button>
            </div>
          </>
        )}
      </Section>

      <Section title="למה משתמש לא רואה פרסומת?" hint="בדיקה לפי מייל, מסך ומקום במסך.">
        <ExplainBox />
      </Section>

      <Section title="הכללים הקבועים" hint="נאכפים בשרת של bloc בכל הצגה. לא משתנים מכאן.">
        <ul style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text)", lineHeight: 1.6, paddingInlineStart: "18px", listStyle: "disc" }} data-ads-rules="">
          {FIXED_RULES.map((r) => <li key={r.key} data-ads-rule={r.key}>{r.text}</li>)}
        </ul>
      </Section>
      <p style={{ fontSize: "12.5px", color: "var(--text-3)" }}>נכון ל-{today.split("-").reverse().join(".")}, לפי שעון ישראל.</p>
    </div>
  );
}

const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 6px 6px 12px", borderRadius: "99px", border: "1px solid var(--border)", fontSize: "14px", color: "var(--text)" };
const pillX: React.CSSProperties = { width: "44px", height: "44px", margin: "-8px -6px -8px -8px", borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" };
