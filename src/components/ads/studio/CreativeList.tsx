"use client";
// studio/CreativeList — המודעות של קמפיין (bloc ADS-2א v2): כרטיס לכל מודעה, "+ מודעה" (הסטודיו בגיליון), עריכה של מודעה
// שעוד לא הוצגה, שכפול כמודעה חדשה, הפעלה / השבתה ומחיקה (רק כשלא הוצגה) — הכל דרך bloc (postAds). באשף, כשאין עדיין מודעה —
// הסטודיו עצמו במקום הרשימה. הצלחה — onChanged (ההורה מרענן).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Banner, solidBtn } from "@/components/ui/panelKit";
import { postAds } from "../adsKit";
import type { AdCreativeRow } from "@/lib/adsServer";
import CreativeCard from "./CreativeCard";
import CreativeStudio, { type StudioMode } from "./CreativeStudio";
import { Sheet, STUDIO_IMAGE_BASE } from "./kit";

export default function CreativeList({ campaignId, creatives, serves, advertiser, advertiserLogo, brandColor, imageBase, canManage, best = null, inlineWhenEmpty = false, template = null, onChanged }: {
  campaignId: string; creatives: AdCreativeRow[]; serves: Record<string, number>; advertiser: string; advertiserLogo: string | null; brandColor: string | null;
  imageBase?: string | null; canManage: boolean; best?: string | null; inlineWhenEmpty?: boolean; template?: string | null;
  onChanged?: (msg: string) => void;
}) {
  const router = useRouter();
  const base = imageBase === undefined ? STUDIO_IMAGE_BASE : imageBase;
  const [sheet, setSheet] = useState<StudioMode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = (msg: string) => { setSheet(null); setNotice(msg); onChanged?.(msg); router.refresh(); };
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
      brandColor={brandColor} mode={mode} imageBase={base} template={template} onDone={done} onCancel={onCancel} />
  );

  if (inlineWhenEmpty && canManage && creatives.length === 0) {
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
          <CreativeCard key={c.id} c={c} served={served} imageBase={base} canManage={canManage} busy={busy === c.id} best={best === c.id}
            onToggle={() => void act(c.id, { action: "creative.active", id: c.id, active: !c.active }, c.active ? "המודעה הושבתה." : "המודעה הופעלה.")}
            onEdit={() => setSheet({ kind: "edit", creative: c, served: served > 0 })}
            onDuplicate={() => setSheet({ kind: "duplicate", creative: c })}
            onDelete={() => void act(c.id, { action: "creative.delete", id: c.id }, "המודעה נמחקה.", "למחוק את המודעה? היא עוד לא הוצגה, ולכן היא נמחקת לגמרי.")} />
        );
      })}
      {canManage && (
        <button type="button" style={{ ...solidBtn("var(--blue)"), alignSelf: "flex-start" }} onClick={() => setSheet({ kind: "new" })} data-creative-new="">
          <Plus size={17} />מודעה
        </button>
      )}
      {sheet && (
        <Sheet title={sheet.kind === "new" ? "מודעה חדשה" : sheet.kind === "edit" ? "עריכת מודעה" : "מודעה חדשה מעותק"} onClose={() => setSheet(null)} wide testId="creative">
          {studio(sheet, () => setSheet(null))}
        </Sheet>
      )}
    </div>
  );
}
