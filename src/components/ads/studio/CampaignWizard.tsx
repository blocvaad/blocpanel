"use client";
// studio/CampaignWizard — "קמפיין חדש" (bloc ADS-2א v2, החלטה 383): חמישה שלבים עם פס התקדמות, "הקודם" / "הבא" צמודים לתחתית,
// ושמירה אוטומטית.
//   1 מפרסם — בחירה / חיפוש, או מפרסם חדש (שם, אתר, לוגו, צבע) וחוזה חדש בלי לצאת; שם מוצע "<מפרסם> · <חודש>". היציאה מהשלב
//     שומרת טיוטה (campaign.save) ועוברת לכתובת של הטיוטה — מכאן כל שינוי נשמר לבד (השהיה קצרה; "נשמר" / "לא נשמר — נסו שוב").
//   2 מודעות — סטודיו המודעה (פורמטים, תמונה ומיקוד, טקסטים, סגנון, תצוגה חיה) והמודעות שנוצרו.
//   3 קהל — עם מד הקהל. 4 תזמון ויעד. 5 סקירה ופרסום — רשימת בדיקה (כל אדום מוביל לשלב שלו), סיכום, כל המודעות בפורמט שלהן,
//     "שמירה כטיוטה" / "פרסום" (campaign.status → active; התחלה בעתיד — "מתוזמן").
// PANEL-PAY א2ב: הכל דרך bloc. תשובה לא ברורה ליצירה (ייתכן שנוצר) — אין יצירה שנייה, רק מעבר לרשימה לבדוק.
// ADS-2ב2: בשלב 2, כשהסטודיו מוצג במקום הרשימה, הפס שלו הוא הצמוד לתחתית ושל האשף — שורה רגילה בסוף (שני פסים צמודים מסתירים
// זה את זה); באמצע העלאה אין מעבר שלב, ועם מודעה שמילאו ועוד לא עלתה — קודם שואלים (CampaignBarView).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, Plus, Search, Check, X, Send } from "lucide-react";
import { Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, Field } from "../adsKit";
import { lockedAfter } from "@/lib/adsUi";
import {
  PRICING_LABEL, CONTRACT_STATUS_LABEL, fmtIls, fmtRange, fmtDays, fmtHours, audienceSummary, fmtInt,
} from "@/lib/ads";
import { FORMAT_INFO, allImagesOurs } from "@/lib/adsFormats";
import { offerEnded } from "@/lib/adsOffer";
import {
  WIZARD_STEPS, campaignPayload, createAutosave, formFromCampaign, formProblem, newCampaignForm, pacingHint, reachText, reviewChecklist, suggestedName,
  type Autosave, type CampaignForm, type CheckItem, type ReachState,
} from "@/lib/adsStudio";
import type { AdAdvertiserRow, AdBuildingOption, AdCampaignRow, AdCreativeRow, CampaignPageData } from "@/lib/adsServer";
import { AdvertiserAvatar, SaveIndicator, StepBar, StickyBar, Sheet, PlacementIcons, STUDIO_CSS, STUDIO_IMAGE_BASE, type SaveState } from "./kit";
import { AdvertiserForm, ContractForm } from "./AdvertiserForms";
import CreativeList from "./CreativeList";
import { leaveAskStays, leaveText, type StudioState } from "@/lib/adsWizard";
import AudienceEditor, { useReach } from "./AudienceEditor";
import ScheduleEditorView from "./ScheduleEditor";
import AdPreview from "./AdPreview";
import { previewFromCreative } from "./StudioPreview";

type Contract = CampaignPageData["contracts"][number];
/** חוזים שאפשר לבחור למפרסם: לא בוטל ולא נגמר (הנוכחי תמיד). */
export function usableContracts(all: Contract[], advertiserId: string, today: string, current?: string): Contract[] {
  return all.filter((k) => k.advertiser_id === advertiserId && (k.id === current || (k.status !== "cancelled" && k.ends_on >= today)));
}
/** החוזה שנבחר מראש: פעיל שמכסה את התאריכים, אחרת פעיל, אחרת הראשון. */
export function pickContract(list: Contract[], starts: string, ends: string): string {
  return (list.find((k) => k.status === "active" && k.starts_on <= starts && k.ends_on >= ends) ?? list.find((k) => k.status === "active") ?? list[0])?.id ?? "";
}

// ── שלב 1 ──
export interface AdvertiserStepProps {
  advertisers: AdAdvertiserRow[]; advertiserId: string; onAdvertiser: (id: string) => void; q: string; onQ: (q: string) => void;
  contracts: Contract[]; contractId: string; onContract: (id: string) => void; name: string; onName: (v: string) => void; suggestion: string;
  onNewAdvertiser: () => void; onNewContract: () => void; contractLocked: boolean; imageBase: string | null;
}
export function AdvertiserStepView(p: AdvertiserStepProps) {
  const t = p.q.trim();
  const list = p.advertisers.filter((a) => !a.archived_at || a.id === p.advertiserId).filter((a) => !t || a.name.includes(t) || a.id === p.advertiserId);
  const chosen = p.advertisers.find((a) => a.id === p.advertiserId) ?? null;
  const k = p.contracts.find((x) => x.id === p.contractId) ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }} data-wizard-step="1">
      <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="מפרסם">
        <h2 style={h2}>מי מפרסם?</h2>
        {p.advertisers.length > 5 && (
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
            <input value={p.q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.onQ(e.target.value)} placeholder="חיפוש מפרסם" aria-label="חיפוש מפרסם" style={{ ...inputStyle, paddingRight: "36px" }} data-wizard-adv-search="" />
          </div>
        )}
        <div role="radiogroup" aria-label="מפרסם" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "8px" }}>
          {list.map((a) => {
            const on = a.id === p.advertiserId;
            const active = a.contracts.filter((x) => x.status === "active").length;
            return (
              <button key={a.id} type="button" role="radio" aria-checked={on} data-wizard-adv={a.id} disabled={p.contractLocked && !on} onClick={() => { if (!on) p.onAdvertiser(a.id); }}
                style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px", minHeight: "60px", borderRadius: "14px", textAlign: "right", fontFamily: "inherit", color: "var(--text)",
                  border: `${on ? 2 : 1}px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.09)" : "var(--card)", opacity: p.contractLocked && !on ? 0.5 : 1 }}>
                <AdvertiserAvatar name={a.name} logo={a.logo_url} color={a.brand_color} size={38} imageBase={p.imageBase} />
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                  <span style={{ fontSize: "14.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{active ? (active === 1 ? "חוזה פעיל אחד" : `${active} חוזים פעילים`) : "אין חוזה פעיל"}</span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={p.onNewAdvertiser} data-wizard-new-adv="" disabled={p.contractLocked}
            style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center", minHeight: "60px", borderRadius: "14px", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--blue)", fontSize: "14.5px", fontWeight: 700, fontFamily: "inherit" }}>
            <Plus size={17} />מפרסם חדש
          </button>
        </div>
        {t && list.length === 0 && <span style={{ fontSize: "13px", color: "var(--text-3)" }}>אין מפרסם בשם הזה — מוסיפים אותו ב&quot;מפרסם חדש&quot;.</span>}
      </section>

      {chosen && (
        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="חוזה" data-wizard-contracts={p.contracts.length}>
          <h2 style={h2}>איזה חוזה?</h2>
          {p.contractLocked && <span style={{ fontSize: "13px", color: "var(--text-2)" }} data-wizard-contract-locked="">הקמפיין כבר הוצג, ולכן הוא נשאר בחוזה שלו.</span>}
          <div role="radiogroup" aria-label="חוזה" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {p.contracts.map((x) => {
              const on = x.id === p.contractId;
              return (
                <button key={x.id} type="button" role="radio" aria-checked={on} disabled={p.contractLocked && !on} data-wizard-contract={x.id} onClick={() => { if (!on) p.onContract(x.id); }}
                  style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "12px", minHeight: "56px", borderRadius: "12px", textAlign: "right", fontFamily: "inherit", color: "var(--text)",
                    border: `${on ? 2 : 1}px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.09)" : "transparent" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                    <span style={{ fontSize: "14.5px", fontWeight: 700 }}>{x.label}</span>
                    <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{fmtIls(x.price_ils)} {PRICING_LABEL[x.pricing]} · {fmtRange(x.starts_on, x.ends_on)}</span>
                  </span>
                  <Tag tone={x.status === "active" ? "ok" : "muted"}>{CONTRACT_STATUS_LABEL[x.status]}</Tag>
                </button>
              );
            })}
            {!p.contractLocked && (
              <button type="button" onClick={p.onNewContract} data-wizard-new-contract=""
                style={{ ...ghostBtn, borderStyle: "dashed", color: "var(--blue)", minHeight: "48px" }}>
                <Plus size={16} />חוזה חדש ל{chosen.name}
              </button>
            )}
          </div>
          {p.contracts.length === 0 && <span style={{ fontSize: "13px", color: "var(--text-2)" }}>אין למפרסם הזה חוזה בתוקף — מוסיפים אחד כאן.</span>}
          {k?.status === "draft" && <Banner tone="warn"><span data-wizard-contract-draft="">החוזה עדיין טיוטה. אפשר להמשיך, אבל הקמפיין יוצג רק אחרי שהחוזה יסומן כפעיל (בדף המפרסם).</span></Banner>}
        </section>
      )}

      {chosen && (
        <section style={{ display: "flex", flexDirection: "column", gap: "8px" }} aria-label="שם">
          <h2 style={h2}>איך נקרא לקמפיין?</h2>
          <Field label="שם פנימי — הדיירים רואים רק את שם המפרסם">
            <input value={p.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.onName(e.target.value)} maxLength={80} style={inputStyle} data-wizard-name="" />
          </Field>
          {p.suggestion && p.name !== p.suggestion && (
            <button type="button" style={{ ...ghostBtn, alignSelf: "flex-start", minHeight: "40px", fontSize: "13px" }} onClick={() => p.onName(p.suggestion)} data-wizard-suggest="">
              הצעה: {p.suggestion}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

// ── שלב 5 ──
export interface ReviewStepProps {
  checklist: CheckItem[]; onStep: (n: number) => void; advertiser: AdAdvertiserRow | null; contract: Contract | null; form: CampaignForm;
  creatives: AdCreativeRow[]; reach: ReachState; today: string; imageBase: string | null; busy: boolean; error: string | null;
  onDraft: () => void; onPublish: () => void;
}
export function ReviewStepView(p: ReviewStepProps) {
  const ok = p.checklist.every((c) => c.ok);
  const active = p.creatives.filter((c) => c.active);
  const future = p.form.starts_on > p.today;
  const hint = pacingHint(p.form);
  const card = (title: string, step: number, body: React.ReactNode, key: string) => (
    <div className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px" }} data-review-card={key}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600 }}>{title}</span>
        <button type="button" style={{ ...ghostBtn, minHeight: "36px", fontSize: "13px", padding: "0 10px" }} onClick={() => p.onStep(step)} data-review-edit={step}>עריכה</button>
      </div>
      {body}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-wizard-step="5">
      <section aria-label="רשימת בדיקה" style={{ display: "flex", flexDirection: "column", gap: "6px" }} data-review-ready={ok ? "yes" : "no"}>
        <h2 style={h2}>{ok ? "הכל מוכן לפרסום" : "מה עוד חסר"}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {p.checklist.map((c) => (
            <li key={c.key} data-check={c.key} data-check-ok={c.ok ? "yes" : "no"}
              style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${c.ok ? "var(--border)" : "#ef444466"}`, background: c.ok ? "transparent" : "#ef44440d" }}>
              <span aria-hidden="true" style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: c.ok ? "var(--green)" : "var(--red)" }}>
                {c.ok ? <Check size={14} color="#fff" strokeWidth={3} /> : <X size={14} color="#fff" strokeWidth={3} />}
              </span>
              <span style={{ flex: 1, fontSize: "14px", color: "var(--text)", lineHeight: 1.5 }}>{c.text}</span>
              {!c.ok && <button type="button" style={{ ...ghostBtn, minHeight: "40px", fontSize: "13px" }} onClick={() => p.onStep(c.step)} data-check-fix={c.step}>לתיקון</button>}
            </li>
          ))}
        </ul>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: "10px" }}>
        {card("מפרסם וחוזה", 1, (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {p.advertiser && <AdvertiserAvatar name={p.advertiser.name} logo={p.advertiser.logo_url} color={p.advertiser.brand_color} size={36} imageBase={p.imageBase} />}
            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
              <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text)" }}>{p.form.name}</span>
              <span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{p.contract ? `${p.contract.label} · ${CONTRACT_STATUS_LABEL[p.contract.status]}` : "בלי חוזה"}</span>
            </span>
          </div>
        ), "advertiser")}
        {card("מודעות", 2, (
          <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "14px", color: "var(--text)" }}>{active.length === 1 ? "מודעה פעילה אחת" : `${active.length} מודעות פעילות`}{p.creatives.length > active.length ? ` (ועוד ${p.creatives.length - active.length} מושבתות)` : ""}</span>
            <PlacementIcons formats={FORMAT_ORDER.filter((f) => active.some((c) => c.format === f))} />
          </span>
        ), "ads")}
        {card("קהל", 3, (
          <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "13.5px", color: "var(--text)", lineHeight: 1.5 }}>{audienceSummary(p.form)}</span>
            <span className="studio-num" style={{ fontSize: "13px", color: "var(--text-2)" }} data-review-reach={p.reach.kind}>{reachText(p.reach)}</span>
          </span>
        ), "audience")}
        {card("תזמון ויעד", 4, (
          <span className="studio-num" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13.5px", color: "var(--text)", lineHeight: 1.5 }}>
            <span>{fmtRange(p.form.starts_on, p.form.ends_on)} · {fmtDays(p.form.days)} · {fmtHours(p.form.hour_from, p.form.hour_to)}</span>
            <span style={{ color: "var(--text-2)" }}>{p.form.goal.trim() ? `יעד ${fmtInt(Number(p.form.goal.replace(/[,\s]/g, "")))} חשיפות` : "בלי יעד"}{p.form.daily.trim() ? ` · עד ${fmtInt(Number(p.form.daily.replace(/[,\s]/g, "")))} ביום` : ""} · עדיפות {p.form.weight}</span>
            {hint && <span style={{ color: "var(--text-2)", fontSize: "12.5px" }}>{hint}</span>}
          </span>
        ), "schedule")}
      </div>

      {p.creatives.length > 0 && (
        <section aria-label="המודעות" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h2 style={h2}>כך המודעות ייראו</h2>
          <div className="studio-scroll" style={{ gap: "14px", paddingBottom: "6px" }} data-review-ads={p.creatives.length}>
            {p.creatives.map((c) => (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flexShrink: 0, opacity: c.active ? 1 : 0.5 }} data-review-ad={c.id}>
                <AdPreview {...previewFromCreative(c, { advertiser: p.advertiser?.name ?? "", advertiserLogo: p.advertiser?.logo_url ?? null, imageBase: p.imageBase })} width={360} scale={0.4} />
                <span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{FORMAT_INFO[c.format].label}{c.active ? "" : " · מושבתת"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.error && <Banner tone="error"><span data-review-error="">{p.error}</span></Banner>}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={p.onPublish} disabled={!ok || p.busy} style={{ ...solidBtn("#16a34a"), opacity: ok && !p.busy ? 1 : 0.6 }} data-review-publish={future ? "scheduled" : "now"}>
          <Send size={17} />{p.busy ? "מפרסמים…" : future ? `פרסום — יתחיל ב-${dayMonth(p.form.starts_on)}` : "פרסום"}
        </button>
        <button type="button" onClick={p.onDraft} disabled={p.busy} style={ghostBtn} data-review-draft="">שמירה כטיוטה</button>
      </div>
      {future && <span style={{ fontSize: "13px", color: "var(--text-2)" }} data-review-scheduled="">תאריך ההתחלה בעתיד — אחרי הפרסום הקמפיין יופיע כ&quot;מתוזמן&quot; ויתחיל לבד.</span>}
    </div>
  );
}
/** "16.11" */
export const dayMonth = (k: string) => `${Number(k.slice(8, 10))}.${Number(k.slice(5, 7))}`;
const FORMAT_ORDER = ["card", "dialog", "fullscreen", "story", "banner", "native", "carousel"] as const;
const h2: React.CSSProperties = { fontSize: "16px", fontWeight: 800, color: "var(--text)" };

// ── האשף ──
/** ADS-2ב2: לאן ביקשו לצאת משלב 2 — שלב אחר, או סטודיו הפרסום ("לסטודיו" למעלה). */
export type LeaveTarget = number | "home";
export const leaveLabel = (to: LeaveTarget) => (to === "home" ? "סטודיו הפרסום" : WIZARD_STEPS[to - 1]);

/**
 * ADS-2ב2: הפס בתחתית האשף. בשלב 2, כשהסטודיו מוצג במקום הרשימה (inline), הפס של הסטודיו הוא הצמוד לתחתית, ושל האשף — שורה
 * רגילה בסוף, משנית ("אפשר להוסיף מודעות גם אחר כך"); באמצע העלאה — אין מעבר (גם לא מהשאלה); leaveTo — ביקשו לצאת כשיש מודעה
 * שעוד לא עלתה: שואלים בשורה רגילה בסוף (לא צמודה — היא לא מכסה את הסטודיו), "לעבור ל… בלי להעלות?". תצוגה בלבד.
 */
export function CampaignBarView({ step, id, canNext: canGo, busy, stale, inline, leaveTo, onBack, onNext, onLeave, onStay }: {
  step: number; id: string | null; canNext: boolean; busy: string | null; stale: "save" | null;
  inline: StudioState | null; leaveTo: LeaveTarget | null; onBack: () => void; onNext: () => void; onLeave: () => void; onStay: () => void;
}) {
  const studio = step === 2 && !!inline;
  if (inline && studio && leaveTo !== null && !inline.busy) {
    const to = leaveLabel(leaveTo);
    return (
      <StickyBar testId="wizard-leave" stick={false}>
        <span role="alert" style={{ flex: "1 1 100%", fontSize: "14px", fontWeight: 700, color: "var(--text)", lineHeight: 1.5 }} data-wizard-leave-ask={leaveTo}>
          {leaveText("new", inline.up, inline.rest, to)}
        </span>
        <button type="button" style={{ ...ghostBtn, color: "var(--red)", borderColor: "rgba(239,68,68,.5)" }} onClick={onLeave} data-wizard-leave-yes="">
          מעבר ל{to} בלי להעלות
        </button>
        <button type="button" style={solidBtn("var(--blue)")} onClick={onStay} data-wizard-leave-no="">המשך עריכה</button>
      </StickyBar>
    );
  }
  if (step === WIZARD_STEPS.length) {
    return (
      <StickyBar testId="wizard">
        <button type="button" style={ghostBtn} onClick={onBack} data-wizard-back=""><ArrowRight size={16} />הקודם</button>
      </StickyBar>
    );
  }
  const hold = studio && !!inline?.busy;
  // mid-upload in the studio the step cannot be left (the same gate as before, with the upload in it)
  const canNext = canGo && !hold;
  return (
    <StickyBar testId="wizard" stick={!studio}>
      {studio && (
        <span style={{ flex: "1 1 100%", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-wizard-studio-note={hold ? "busy" : "idle"}>
          {hold ? "מעלים את המודעה — רגע, ואז אפשר לעבור שלב." : "אפשר להוסיף מודעות גם אחר כך — מהשלב הזה או מדף הקמפיין."}
        </span>
      )}
      {step > 1 && (
        <button type="button" style={ghostBtn} onClick={onBack} disabled={hold} data-wizard-back="">
          {/* under the studio's own "הקודם" the wizard's says where it goes */}
          <ArrowRight size={16} />{studio ? `הקודם: ${WIZARD_STEPS[step - 2]}` : "הקודם"}
        </button>
      )}
      <button type="button" style={{ ...(studio ? ghostBtn : solidBtn("var(--blue)")), flex: 1, maxWidth: "320px", opacity: canNext && !busy ? 1 : 0.6, marginInlineStart: "auto" }}
        disabled={!canNext || !!busy || stale === "save"} onClick={onNext} data-wizard-next={step}>
        {busy === "save" ? "שומרים טיוטה…" : step === 1 && !id ? "שמירה והמשך" : `הבא: ${WIZARD_STEPS[step]}`}<ChevronLeft size={16} />
      </button>
    </StickyBar>
  );
}

export default function CampaignWizard({ today, campaign, creatives, serves, advertisers, contracts, buildings, cities, initialStep = 1, initialAdvertiser = null, template = null, imageBase = STUDIO_IMAGE_BASE }: {
  today: string; campaign: AdCampaignRow | null; creatives: AdCreativeRow[]; serves: Record<string, number>;
  advertisers: AdAdvertiserRow[]; contracts: Contract[]; buildings: AdBuildingOption[]; cities: string[];
  initialStep?: number; initialAdvertiser?: string | null; template?: string | null; imageBase?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [advertiserId, setAdvertiserId] = useState<string>(campaign?.advertiser_id ?? (advertisers.some((a) => a.id === initialAdvertiser) ? initialAdvertiser! : ""));
  const [form, setFormState] = useState<CampaignForm>(() => {
    if (campaign) return formFromCampaign(campaign);
    const f = newCampaignForm(today);
    const adv = advertisers.find((a) => a.id === initialAdvertiser);
    if (!adv) return f;
    return { ...f, name: suggestedName(adv.name, today), contract_id: pickContract(usableContracts(contracts, adv.id, today), f.starts_on, f.ends_on) };
  });
  const [q, setQ] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** תשובה לא ברורה ליצירת הטיוטה — ייתכן שכבר נוצרה: אין יצירה שנייה עד שבודקים ברשימה. */
  const [stale, setStale] = useState<"save" | null>(null);
  const [sheet, setSheet] = useState<"advertiser" | "contract" | null>(null);
  const [pubErr, setPubErr] = useState<string | null>(null);
  // ADS-2ב2: the studio shown in place of the list on step 2 (null — not shown), and the step the user asked for while it holds work
  const [inlineSt, setInlineSt] = useState<StudioState | null>(null);
  const [leaveTo, setLeaveTo] = useState<LeaveTarget | null>(null);
  const formRef = useRef(form);
  const id = campaign?.id ?? null;
  /** השמירה האוטומטית של הטיוטה (רק כשיש כבר טיוטה): השהיה של 900ms, אחת אחרי השנייה, תמיד עם הטופס האחרון. */
  const auto = useRef<Autosave<CampaignForm> | null>(null);
  if (id && !auto.current) {
    auto.current = createAutosave<CampaignForm>(form, {
      delay: 900, problem: formProblem, onState: (s, e) => { setSave(s); setSaveErr(e); },
      send: async (f) => { const r = await postAds(campaignPayload(id, f)); return r.ok ? { ok: true } : { ok: false, error: r.error, unclear: r.unclear }; },
    });
  }
  const served = (campaign?.serves ?? 0) > 0;
  const advertiser = advertisers.find((a) => a.id === advertiserId) ?? null;
  const myContracts = usableContracts(contracts, advertiserId, today, campaign?.contract_id);
  const contract = contracts.find((k) => k.id === form.contract_id) ?? null;
  const reach = useReach(form, step === 3 || step === 5);
  useEffect(() => () => auto.current?.dispose(), []);

  /** עכשיו (מעבר שלב, פרסום); בלי טיוטה — אין מה לשמור. */
  const flush = (): Promise<boolean> => auto.current ? auto.current.flush() : Promise.resolve(true);
  function change(next: CampaignForm) {
    formRef.current = next; setFormState(next);
    auto.current?.change(next);
  }
  function goStep(n: number) {
    if (n > 1 && !id) return;
    setLeaveTo(null);
    setStep(n);
    if (id) window.history.replaceState(null, "", `/ads/campaigns/${id}?step=${n}`);
    window.scrollTo?.({ top: 0 });
  }
  function chooseAdvertiser(advId: string) {
    const adv = advertisers.find((a) => a.id === advId);
    if (!adv) return;
    const prev = advertiser ? suggestedName(advertiser.name, today) : "";
    const list = usableContracts(contracts, advId, today);
    const f = formRef.current;
    setAdvertiserId(advId);
    change({ ...f, name: !f.name.trim() || f.name === prev ? suggestedName(adv.name, today) : f.name, contract_id: pickContract(list, f.starts_on, f.ends_on) });
  }

  async function createDraft() {
    if (stale || busy) return;
    const problem = formProblem(formRef.current);
    if (problem) { setErr(problem); return; }
    setBusy("save"); setErr(null);
    const r = await postAds<{ id: string }>(campaignPayload(null, formRef.current));
    setBusy(null);
    if (!r.ok) { setErr(r.error); if (lockedAfter(r, !campaign)) setStale("save"); return; }
    router.replace(`/ads/campaigns/${r.data.id}?step=2`);
  }
  /** ADS-2ב2: יציאה משלב 2 כשהסטודיו שבמקום הרשימה באמצע העלאה — לא; כשיש בו מודעה שמילאו ועוד לא עלתה — קודם שואלים. */
  function leaveOr(n: LeaveTarget) {
    if (step === 2 && n !== 2 && inlineSt) {
      if (inlineSt.busy) return;
      if (inlineSt.dirty) { setLeaveTo(n); return; }
    }
    if (n === "home") router.push("/ads");
    else goStep(n);
  }
  // "מעבר ל… בלי להעלות": never mid-upload (an upload may have started under the question)
  function leaveNow() {
    if (leaveTo === null || inlineSt?.busy) return;
    // the question goes away at once ("keep editing" could not stop a navigation that already started)
    if (leaveTo === "home") { setLeaveTo(null); router.push("/ads"); }
    else goStep(leaveTo);
  }
  // the question is about the studio as it is: an upload started, or nothing left unsaved — the question is gone
  useEffect(() => { if (leaveTo !== null && !leaveAskStays(inlineSt)) setLeaveTo(null); }, [leaveTo, inlineSt]);
  // the question takes the focus (a static row at the end of the page — the focus also scrolls it into view)
  useEffect(() => {
    if (leaveTo !== null) document.querySelector<HTMLElement>("[data-wizard-leave-no]")?.focus();
  }, [leaveTo]);
  async function next() {
    if (step === 1 && !id) { await createDraft(); return; }
    if (step < WIZARD_STEPS.length) { void flush(); leaveOr(step + 1); }
  }
  async function publish() {
    if (!id || busy) return;
    setBusy("publish"); setPubErr(null);
    const saved = await flush();
    if (!saved) { setBusy(null); setPubErr("השינויים האחרונים לא נשמרו — שומרים קודם, ואז מפרסמים."); return; }
    const r = await postAds({ action: "campaign.status", id, status: "active" });
    setBusy(null);
    if (!r.ok) { setPubErr(r.error); return; }
    router.replace(`/ads/campaigns/${id}?published=${formRef.current.starts_on > today ? "scheduled" : "1"}`);
  }
  async function keepDraft() {
    setBusy("draft");
    await flush();
    setBusy(null);
    router.push("/ads?tab=draft");
  }

  const checklist = reviewChecklist({
    advertiserId, contract, form,
    creatives: creatives.map((c) => ({
      active: c.active, ready: allImagesOurs(c.image_url, c.frames, imageBase), headline: c.headline, image_alt: c.image_alt, cta_label: c.cta_label,
      ended: offerEnded(c.offer_ends_on, today),
    })),
    today,
  });
  const canNext = step === 1 ? !!advertiserId && !!form.contract_id && form.name.trim().length >= 2 && !stale : step < WIZARD_STEPS.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }} data-wizard={step} data-wizard-campaign={id ?? "new"}>
      <style>{STUDIO_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <Link href="/ads" style={{ ...ghostBtn, textDecoration: "none", opacity: step === 2 && inlineSt?.busy ? 0.6 : 1 }} data-wizard-home=""
          aria-disabled={step === 2 && inlineSt?.busy ? true : undefined}
          onClick={(e: React.MouseEvent) => {
            // a new tab / window (Ctrl, Cmd, Shift, Alt) loses nothing — the browser's own
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (step === 2 && inlineSt && (inlineSt.busy || inlineSt.dirty)) { e.preventDefault(); leaveOr("home"); }
          }}>
          <ArrowRight size={16} />לסטודיו
        </Link>
        <SaveIndicator state={id ? save : "idle"} error={saveErr} onRetry={() => { void auto.current?.retry(); }} onRefresh={() => router.refresh()} />
      </div>
      <div>
        <h1 style={{ fontSize: "21px", fontWeight: 800, color: "var(--text)" }}>{id ? form.name || "טיוטה" : "קמפיין חדש"}</h1>
        <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>{id ? "טיוטה — כל שינוי נשמר לבד." : "חמישה שלבים קצרים. אחרי השלב הראשון הכל נשמר לבד."}</p>
      </div>
      <StepBar steps={[...WIZARD_STEPS]} current={step} reachable={(n) => (n === 1 || !!id) && !(step === 2 && n !== 2 && !!inlineSt?.busy)} onStep={leaveOr} />
      {err && (
        <Banner tone="error" action={stale ? <Link href="/ads?tab=draft" style={{ ...ghostBtn, textDecoration: "none" }} data-campaign-recheck="">לרשימת הטיוטות</Link> : undefined}>
          <span data-campaign-error="">{err}</span>
        </Banner>
      )}

      {step === 1 && (
        <AdvertiserStepView advertisers={advertisers} advertiserId={advertiserId} onAdvertiser={chooseAdvertiser} q={q} onQ={setQ}
          contracts={myContracts} contractId={form.contract_id} onContract={(k) => change({ ...formRef.current, contract_id: k })}
          name={form.name} onName={(v) => change({ ...formRef.current, name: v })} suggestion={advertiser ? suggestedName(advertiser.name, today) : ""}
          onNewAdvertiser={() => setSheet("advertiser")} onNewContract={() => setSheet("contract")} contractLocked={served} imageBase={imageBase} />
      )}
      {step === 2 && id && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-wizard-step="2">
          <h2 style={h2}>המודעות</h2>
          <CreativeList campaignId={id} creatives={creatives} serves={serves} advertiser={advertiser?.name ?? campaign?.advertiser ?? ""}
            advertiserLogo={advertiser?.logo_url ?? null} brandColor={advertiser?.brand_color ?? null} imageBase={imageBase} canManage inlineWhenEmpty template={template}
            today={today} campaignEndsOn={form.ends_on || null} onInline={setInlineSt} />
        </div>
      )}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-wizard-step="3">
          <h2 style={h2}>למי להציג?</h2>
          <AudienceEditor value={form} onChange={(v) => change({ ...formRef.current, ...v })} cities={cities} buildings={buildings} reach={reach} />
        </div>
      )}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-wizard-step="4">
          <h2 style={h2}>מתי, וכמה?</h2>
          <ScheduleEditorView value={form} onChange={(v) => change({ ...formRef.current, ...v })} today={today} />
        </div>
      )}
      {step === 5 && (
        <ReviewStepView checklist={checklist} onStep={goStep} advertiser={advertiser} contract={contract} form={form} creatives={creatives} reach={reach}
          today={today} imageBase={imageBase} busy={busy === "publish" || busy === "draft"} error={pubErr} onDraft={() => void keepDraft()} onPublish={() => void publish()} />
      )}

      <CampaignBarView step={step} id={id} canNext={canNext} busy={busy} stale={stale} inline={step === 2 ? inlineSt : null} leaveTo={leaveTo}
        onBack={() => leaveOr(step - 1)} onNext={() => void next()} onLeave={leaveNow}
        onStay={() => { setLeaveTo(null); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-wizard-next]")?.focus()); }} />

      {sheet === "advertiser" && (
        <Sheet title="מפרסם חדש" onClose={() => setSheet(null)} testId="advertiser">
          <AdvertiserForm initial={null} compact imageBase={imageBase} onCancel={() => setSheet(null)}
            onSaved={(_msg, newId, newName) => {
              setSheet(null);
              if (newId) {
                setAdvertiserId(newId);
                const f = formRef.current;
                change({ ...f, contract_id: "", name: !f.name.trim() && newName ? suggestedName(newName, today) : f.name });
              }
              router.refresh();
            }} />
        </Sheet>
      )}
      {sheet === "contract" && advertiser && (
        <Sheet title={`חוזה חדש: ${advertiser.name}`} onClose={() => setSheet(null)} testId="contract">
          <ContractForm advertiser={{ id: advertiser.id, name: advertiser.name }} initial={null} defaults={{ starts_on: form.starts_on, ends_on: form.ends_on, status: "active" }}
            onCancel={() => setSheet(null)} onSaved={(_msg, newId) => { setSheet(null); if (newId) change({ ...formRef.current, contract_id: newId }); router.refresh(); }} />
        </Sheet>
      )}
    </div>
  );
}

