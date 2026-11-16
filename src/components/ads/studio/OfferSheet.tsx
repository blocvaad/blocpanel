"use client";
// studio/OfferSheet — הקוד וסוף המבצע של מודעה שכבר הוצגה (bloc ADS-2ב1, החלטה 388). ad_creative_guard של bloc נועל את הפורמט,
// התמונות והטקסטים אחרי ההצגה הראשונה, ומתיר את הקוד ואת סוף המבצע — הארכת מבצע היא דבר רגיל. השמירה: creative.save עם אותו id
// ובדיוק הערכים השמורים (offerPayloadFor — מהשורה, לא מטופס), ועוד הקוד והתאריך החדשים. bloc ענה locked — משהו אחר במודעה לא תאם
// את מה ששמור: משפט משלו ורענון (לא "הפורמט והתוכן קבועים", שלא קשור לכאן).
// OfferSheetView — התצוגה (טהורה); OfferEditor — המצב והבקשה.
import { useState } from "react";
import { Banner, solidBtn, ghostBtn } from "@/components/ui/panelKit";
import { postAds } from "../adsKit";
import { OfferFields } from "./CreativeStudio";
import { offerIssues, offerPayloadFor } from "@/lib/adsStudio";
import { normalizeCoupon } from "@/lib/adsOffer";
import { FORMAT_INFO } from "@/lib/adsFormats";
import { ilTodayKey } from "@/lib/broadcasts";
import type { AdCreativeRow } from "@/lib/adsServer";

export const OFFER_SAVED_TEXT = "הקוד וסוף המבצע נשמרו.";
export const OFFER_LOCKED_TEXT = "bloc לא שמר: משהו אחר במודעה לא תאם את מה ששמור אצלו (אולי היא השתנתה בינתיים). רעננו את הדף ונסו שוב.";

export function OfferSheetView({ creative, coupon, offerEndsOn, onChange, today, campaignEndsOn, busy, err, onSave, onCancel }: {
  creative: AdCreativeRow; coupon: string; offerEndsOn: string; onChange: (v: { coupon_code: string; offer_ends_on: string }) => void; today: string;
  campaignEndsOn: string | null; busy: boolean; err: string | null; onSave: () => void; onCancel: () => void;
}) {
  const problems = offerIssues({ coupon_code: coupon, offer_ends_on: offerEndsOn }, today);
  const dirty = normalizeCoupon(coupon) !== (creative.coupon_code ?? "") || offerEndsOn.trim() !== (creative.offer_ends_on ?? "");
  const can = dirty && problems.length === 0 && !busy;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-offer-sheet={creative.id}>
      <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
        <b style={{ color: "var(--text)" }}>{creative.headline}</b> · {FORMAT_INFO[creative.format].label}. המודעה כבר הוצגה, ולכן רק הקוד וסוף המבצע משתנים — השאר נשאר כמו שהוא.
      </p>
      <OfferFields coupon={coupon} offerEndsOn={offerEndsOn} onChange={onChange} today={today} formats={[creative.format]} campaignEndsOn={campaignEndsOn} disabled={busy} testId="sheet" />
      {err && <Banner tone="error"><span data-offer-error="">{err}</span></Banner>}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={onSave} disabled={!can} style={{ ...solidBtn("var(--blue)"), opacity: can ? 1 : 0.6 }} data-offer-save="">{busy ? "שומרים…" : "שמירה"}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn} data-offer-cancel="">ביטול</button>
      </div>
    </div>
  );
}

export default function OfferEditor({ creative, campaignEndsOn = null, today, onDone, onCancel }: {
  creative: AdCreativeRow; campaignEndsOn?: string | null; today?: string; onDone: (msg: string) => void; onCancel: () => void;
}) {
  const day = today ?? ilTodayKey();
  const [v, setV] = useState({ coupon_code: creative.coupon_code ?? "", offer_ends_on: creative.offer_ends_on ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (busy || offerIssues(v, day).length) return;
    setBusy(true); setErr(null);
    const r = await postAds(offerPayloadFor(creative, v));
    setBusy(false);
    if (!r.ok) { setErr(r.code === "locked" ? OFFER_LOCKED_TEXT : r.error); return; }
    onDone(OFFER_SAVED_TEXT);
  }
  return (
    <OfferSheetView creative={creative} coupon={v.coupon_code} offerEndsOn={v.offer_ends_on} onChange={setV} today={day} campaignEndsOn={campaignEndsOn}
      busy={busy} err={err} onSave={() => void save()} onCancel={onCancel} />
  );
}
