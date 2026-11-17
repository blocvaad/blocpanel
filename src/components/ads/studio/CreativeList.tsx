"use client";
// studio/CreativeList — המודעות של קמפיין (bloc ADS-2א v2): כרטיס לכל מודעה, "+ מודעה" (הסטודיו בגיליון), עריכה של מודעה
// שעוד לא הוצגה, שכפול כמודעה חדשה, הפעלה / השבתה ומחיקה (רק כשלא הוצגה) — הכל דרך bloc (postAds). באשף, כשאין עדיין מודעה —
// הסטודיו עצמו במקום הרשימה. הצלחה — onChanged (ההורה מרענן).
// ADS-2ב1: מודעה שהוצגה — "קופון וסוף מבצע" בגיליון קטן (OfferEditor): רק שני השדות האלה משתנים.
// ADS-2ב2 (החלטה 399): כשבסטודיו יש מודעה שמילאו ועוד לא הועלתה / נשמרה — סגירת הגיליון קודם שואלת (אותו משפט כמו בסטודיו);
// באמצע העלאה — הגיליון לא נסגר; סגירה אחרי שחלק עלה (או אחרי תשובה לא ברורה) — הרשימה מתרעננת ואומרת מה נוצר. באשף, הסטודיו
// שבמקום הרשימה נשאר עד שמסיימים בו (גם כשחלק כבר עלה והרשימה רועננה), ומה שהוא מדווח עולה לאשף (onInline).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Banner, solidBtn } from "@/components/ui/panelKit";
import { postAds } from "../adsKit";
import type { AdCreativeRow } from "@/lib/adsServer";
import CreativeCard from "./CreativeCard";
import CreativeStudio, { type StudioMode } from "./CreativeStudio";
import OfferEditor from "./OfferSheet";
import { Sheet, STUDIO_IMAGE_BASE } from "./kit";
import { STUDIO_IDLE, closeOutcome, leaveText, leaveYes, type StudioState } from "@/lib/adsWizard";

export default function CreativeList({ campaignId, creatives, serves, advertiser, advertiserLogo, brandColor, imageBase, canManage, best = null, inlineWhenEmpty = false, template = null, onChanged, today, campaignEndsOn = null, onInline }: {
  campaignId: string; creatives: AdCreativeRow[]; serves: Record<string, number>; advertiser: string; advertiserLogo: string | null; brandColor: string | null;
  imageBase?: string | null; canManage: boolean; best?: string | null; inlineWhenEmpty?: boolean; template?: string | null;
  onChanged?: (msg: string) => void;
  /** ADS-2ב1: היום לפי שעון ישראל (בבדיקות), וסוף הקמפיין — להערה ליד סוף המבצע. */
  today?: string; campaignEndsOn?: string | null;
  /** ADS-2ב2: באשף — מה הסטודיו שבמקום הרשימה מדווח (null — הוא לא מוצג), כדי שהאשף ישאל לפני שעוזבים את השלב. */
  onInline?: (s: StudioState | null) => void;
}) {
  const router = useRouter();
  const base = imageBase === undefined ? STUDIO_IMAGE_BASE : imageBase;
  const [sheet, setSheet] = useState<StudioMode | null>(null);
  const [offer, setOffer] = useState<AdCreativeRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [st, setSt] = useState<StudioState>(STUDIO_IDLE);
  // the wizard shows the studio in place of the list while the campaign has no ad — and keeps it until the studio is done
  const [inline, setInline] = useState(inlineWhenEmpty && canManage && creatives.length === 0);
  const done = (msg: string) => { setSheet(null); setInline(false); setSt(STUDIO_IDLE); setOffer(null); setNotice(msg); onChanged?.(msg); router.refresh(); };
  const open = (m: StudioMode) => { setSt(STUDIO_IDLE); setSheet(m); };
  // closing the sheet after part of the formats went up (or after an unclear answer) refreshes the list and says what was created
  const close = () => { const text = closeOutcome(st.up, st.rest, st.maybe); if (text) { done(text); return; } setSheet(null); setSt(STUDIO_IDLE); };
  // in the wizard: what the studio reports goes up (null when it is not shown, and when the step unmounts)
  useEffect(() => { onInline?.(inline ? st : null); }, [inline, st, onInline]);
  useEffect(() => () => onInline?.(null), [onInline]);
  // in the wizard, every format that goes up — and an unclear answer (the ad may exist) — refreshes the campaign (its checklist and
  // review see the new ad); the studio stays
  const upN = st.up.length;
  useEffect(() => { if (inline && (upN > 0 || st.maybe)) router.refresh(); }, [inline, upN, st.maybe, router]);
  async function act(id: string, body: Record<string, unknown>, msg: string, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id); setErr(null); setNotice(null);
    const r = await postAds(body);
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    done(msg);
  }
  const studio = (mode: StudioMode, onCancel?: () => void) => (
    <CreativeStudio key={mode.kind + (mode.kind === "new" ? "" : mode.creative.id)} campaignId={campaignId} advertiser={advertiser} advertiserLogo={advertiserLogo}
      brandColor={brandColor} mode={mode} imageBase={base} template={template} onDone={done} onCancel={onCancel} today={today} campaignEndsOn={campaignEndsOn}
      onState={setSt} />
  );

  if (inline) {
    return <div data-creative-list="inline">{studio({ kind: "new" })}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-creative-list={creatives.length}>
      {notice && <Banner tone="ok"><span data-creative-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-creative-list-error="">{err}</span></Banner>}
      {creatives.length === 0 && <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-creatives-empty="">אין עדיין מודעה. בלי מודעה פעילה הקמפיין לא מוצג.</p>}
      {creatives.map((c) => {
        const served = serves[c.id] ?? 0;
        return (
          <CreativeCard key={c.id} c={c} served={served} imageBase={base} canManage={canManage} busy={busy === c.id} best={best === c.id} today={today}
            onOffer={canManage && served > 0 ? () => setOffer(c) : undefined}
            onToggle={() => void act(c.id, { action: "creative.active", id: c.id, active: !c.active }, c.active ? "המודעה הושבתה." : "המודעה הופעלה.")}
            onEdit={() => open({ kind: "edit", creative: c, served: served > 0 })}
            onDuplicate={() => open({ kind: "duplicate", creative: c })}
            onDelete={() => void act(c.id, { action: "creative.delete", id: c.id }, "המודעה נמחקה.", "למחוק את המודעה? היא עוד לא הוצגה, ולכן היא נמחקת לגמרי.")} />
        );
      })}
      {canManage && (
        <button type="button" style={{ ...solidBtn("var(--blue)"), alignSelf: "flex-start" }} onClick={() => open({ kind: "new" })} data-creative-new="">
          <Plus size={17} />מודעה
        </button>
      )}
      {sheet && (
        <Sheet title={sheet.kind === "new" ? "מודעה חדשה" : sheet.kind === "edit" ? "עריכת מודעה" : "מודעה חדשה מעותק"} onClose={close} wide testId="creative"
          busy={st.busy} guard={st.dirty ? leaveText(sheet.kind, st.up, st.rest) : null} guardYes={leaveYes(sheet.kind)}>
          {studio(sheet, close)}
        </Sheet>
      )}
      {offer && (
        <Sheet title="קופון וסוף מבצע" onClose={() => setOffer(null)} testId="offer">
          <OfferEditor key={offer.id} creative={offer} campaignEndsOn={campaignEndsOn} today={today} onDone={done} onCancel={() => setOffer(null)} />
        </Sheet>
      )}
    </div>
  );
}
