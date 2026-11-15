// CreativeImageField — התמונה של הפרסומת (PANEL-PAY א2ב, החלטות 372–373). רק דרך כפתור ההעלאה: bloc מקבל רק תמונה
// מהבאקט שלו, ותמונה מאתר אחר לא מוצגת לדיירים (הצגת פרסומת לא פונה לצד שלישי). תצוגה בלבד — מה כתוב בה נקבע ב-
// imageBoxState (lib/adsUi): אין תמונה / מעלים / הועלתה / שמורה ב-bloc / מאתר אחר / ההעלאה נכשלה / bloc סירב לתמונה.
import { Upload, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { ghostBtn } from "@/components/ui/panelKit";
import type { ImageBox } from "@/lib/adsUi";

const TONE: Record<ImageBox["tone"], string> = { empty: "#a1a1aa", busy: "#3b82f6", ok: "#22c55e", warn: "#eab308", error: "#ef4444" };

export default function CreativeImageField({ url, box, locked, onPick }: {
  url: string; box: ImageBox; locked: boolean; onPick: () => void;
}) {
  const c = TONE[box.tone];
  const Icon = box.tone === "ok" ? CheckCircle2 : box.tone === "warn" ? AlertTriangle : box.tone === "error" ? XCircle : box.tone === "busy" ? RefreshCw : Upload;
  const dim = box.tone === "warn" || box.tone === "error" || box.tone === "busy";
  return (
    <div data-creative-image={box.tone} aria-busy={box.busy || undefined}
      style={{
        display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px", borderRadius: "12px",
        border: box.tone === "empty" ? "1px dashed var(--border-2)" : `1px solid ${c}55`,
        background: box.tone === "empty" ? "transparent" : `${c}10`,
      }}>
      <div aria-hidden="true" style={{
        width: "64px", height: "80px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--surface)",
        border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "12px",
      }}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: dim ? 0.5 : 1 }} />
          : "4:5"}
      </div>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        <div role={box.tone === "error" ? "alert" : "status"} data-creative-image-title=""
          style={{ display: "flex", gap: "6px", alignItems: "flex-start", fontSize: "14.5px", fontWeight: 700, color: "var(--text)", lineHeight: 1.5 }}>
          <Icon size={16} color={c} style={{ flexShrink: 0, marginTop: "3px" }} />
          <span>{box.title}</span>
        </div>
        {box.file && (
          <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5, overflowWrap: "anywhere" }} data-creative-image-file="">
            <bdi>{box.file}</bdi>
          </div>
        )}
        {box.detail && (
          <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-creative-image-detail="">{box.detail}</div>
        )}
        <button type="button" style={{ ...ghostBtn, alignSelf: "flex-start", marginTop: "4px", opacity: locked || box.busy ? 0.6 : 1 }}
          disabled={locked || box.busy} onClick={onPick} data-creative-upload="">
          <Upload size={15} />{box.button}
        </button>
      </div>
    </div>
  );
}
