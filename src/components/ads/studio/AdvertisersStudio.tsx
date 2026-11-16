"use client";
// studio/AdvertisersStudio — המפרסמים בסטודיו (bloc ADS-2א v2, החלטה 383): כרטיס לכל מפרסם (הלוגו או האות על צבע המותג, חוזים
// פעילים, קמפיינים), ודף מפרסם — פרטים, המותג (לוגו דרך ההעלאה, צבע — advertiser.save דרך bloc), חוזים (הכללים הקיימים: תמחור
// קבוע אחרי הצגה, מחיקה רק בלי קמפיינים) וקמפיינים. כל כתיבה — דרך bloc (postAds).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, FileText, Search, ArrowRight, ChevronLeft } from "lucide-react";
import { Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds } from "../adsKit";
import { fmtInt, fmtIls, fmtCtr, fmtRange, PRICING_LABEL, CONTRACT_STATUS_LABEL, type Tone } from "@/lib/ads";
import type { AdAdvertiserRow, AdCampaignRow, AdContractRow } from "@/lib/adsServer";
import { AdvertiserAvatar, PlacementIcons, Sheet, StudioNav, STUDIO_CSS, STUDIO_IMAGE_BASE } from "./kit";
import { AdvertiserForm, ContractForm } from "./AdvertiserForms";

/** טקסט משמאל לימין (טלפון, ח.פ, מספר חוזה) בתוך עברית — בלי שהסוגריים והמקפים יתהפכו ובלי שבירה באמצע. */
export const ltr = (s: string) => `⁦${s.replace(/-/g, "‑")}⁩`;
const contractTone = (k: AdContractRow, today: string): "ok" | "muted" | "danger" => (k.status === "active" ? (k.ends_on < today ? "muted" : "ok") : k.status === "cancelled" ? "danger" : "muted");
const contractLabel = (k: AdContractRow, today: string) => (k.status === "active" && k.ends_on < today ? "הסתיים" : CONTRACT_STATUS_LABEL[k.status]);

export function AdvertisersListView({ advertisers, campaigns, canManage, q, onQ, showArchived, onShowArchived, onNew, imageBase, today }: {
  advertisers: AdAdvertiserRow[]; campaigns: AdCampaignRow[]; canManage: boolean; q: string; onQ: (q: string) => void;
  showArchived: boolean; onShowArchived: (v: boolean) => void; onNew: () => void; imageBase: string | null; today: string;
}) {
  const t = q.trim();
  const archivedN = advertisers.filter((a) => a.archived_at).length;
  const list = advertisers.filter((a) => (showArchived || !a.archived_at) && (!t || a.name.includes(t)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-advertisers={list.length}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
          <input value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onQ(e.target.value)} placeholder="חיפוש מפרסם" aria-label="חיפוש מפרסם" style={{ ...inputStyle, paddingRight: "36px" }} data-advertisers-search="" />
        </div>
        {canManage && <button type="button" style={solidBtn("var(--blue)")} onClick={onNew} data-ads-new-advertiser=""><Plus size={17} />מפרסם חדש</button>}
      </div>
      {archivedN > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", fontSize: "14px", color: "var(--text-2)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onShowArchived(e.target.checked)} style={{ width: "18px", height: "18px" }} data-advertisers-archived="" />
          להציג גם מפרסמים בארכיון ({archivedN})
        </label>
      )}
      {advertisers.length === 0 && (
        <div className="card" style={{ padding: "24px 18px", textAlign: "center" }} data-ads-no-advertisers="">
          <p style={{ fontSize: "17px", fontWeight: 800, color: "var(--text)" }}>עוד אין מפרסמים</p>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "6px", lineHeight: 1.6 }}>מפרסם הוא העסק שמשלם. לכל מפרסם — חוזה אחד או יותר, ולכל חוזה — קמפיינים. אפשר גם להוסיף מפרסם תוך כדי יצירת קמפיין.</p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(280px,100%),1fr))", gap: "10px" }}>
        {list.map((a) => {
          const active = a.contracts.filter((k) => k.status === "active" && k.ends_on >= today).length;
          const mine = campaigns.filter((c) => c.advertiser_id === a.id);
          const running = mine.filter((c) => c.phase === "running").length;
          return (
            <Link key={a.id} href={`/ads/advertisers/${a.id}`} className="card" data-advertiser-card={a.id}
              style={{ padding: "14px", display: "flex", gap: "12px", alignItems: "center", textDecoration: "none", color: "var(--text)", borderInlineStart: a.brand_color ? `4px solid ${a.brand_color}` : undefined }}>
              <AdvertiserAvatar name={a.name} logo={a.logo_url} color={a.brand_color} size={48} imageBase={imageBase} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ fontSize: "15.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }}>
                  {active === 1 ? "חוזה פעיל אחד" : `${fmtInt(active)} חוזים פעילים`} · {mine.length === 1 ? "קמפיין אחד" : `${fmtInt(mine.length)} קמפיינים`}{running ? ` (${fmtInt(running)} רצים)` : ""}
                </span>
                {a.archived_at && <span><Tag tone="muted">בארכיון</Tag></span>}
              </span>
              <ChevronLeft size={18} color="var(--text-3)" />
            </Link>
          );
        })}
      </div>
      {t && list.length === 0 && advertisers.length > 0 && <p style={{ fontSize: "14px", color: "var(--text-2)" }}>אין מפרסם בשם הזה.</p>}
    </div>
  );
}

export function AdvertisersStudio({ advertisers, campaigns, canManage, today, imageBase = STUDIO_IMAGE_BASE }: {
  advertisers: AdAdvertiserRow[]; campaigns: AdCampaignRow[]; canManage: boolean; today: string; imageBase?: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-advertisers-studio="">
      <style>{STUDIO_CSS}</style>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>מפרסמים</h1>
        <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>העסקים שמפרסמים — המותג, החוזים והקמפיינים של כל אחד.</p>
      </div>
      <StudioNav active="advertisers" />
      {notice && <Banner tone="ok"><span data-ads-notice="">{notice}</span></Banner>}
      <AdvertisersListView advertisers={advertisers} campaigns={campaigns} canManage={canManage} q={q} onQ={setQ} showArchived={showArchived} onShowArchived={setShowArchived}
        onNew={() => setSheet(true)} imageBase={imageBase} today={today} />
      {sheet && (
        <Sheet title="מפרסם חדש" onClose={() => setSheet(false)} testId="advertiser">
          <AdvertiserForm initial={null} imageBase={imageBase} onCancel={() => setSheet(false)}
            onSaved={(msg, id) => { setSheet(false); setNotice(msg); if (id) router.push(`/ads/advertisers/${id}`); else router.refresh(); }} />
        </Sheet>
      )}
    </div>
  );
}

export function AdvertiserStudio({ advertiser: a, campaigns, canManage, today, imageBase = STUDIO_IMAGE_BASE }: {
  advertiser: AdAdvertiserRow; campaigns: AdCampaignRow[]; canManage: boolean; today: string; imageBase?: string | null;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [con, setCon] = useState<AdContractRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = campaigns.filter((c) => c.advertiser_id === a.id);
  const done = (msg: string) => { setNotice(msg); setErr(null); router.refresh(); };
  async function act(key: string, body: Record<string, unknown>, msg: string, confirmText?: string, after?: () => void) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setErr(null); setNotice(null);
    const r = await postAds(body);
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    if (after) after(); else done(msg);
  }
  const details = [a.legal_name, a.business_id ? `ח.פ ${ltr(a.business_id)}` : null, a.contact_name, a.contact_phone ? ltr(a.contact_phone) : null, a.contact_email ? ltr(a.contact_email) : null].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-advertiser-studio={a.id}>
      <style>{STUDIO_CSS}</style>
      <Link href="/ads/advertisers" style={{ ...ghostBtn, alignSelf: "flex-start", textDecoration: "none" }}><ArrowRight size={16} />לכל המפרסמים</Link>
      <header className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", borderTop: a.brand_color ? `4px solid ${a.brand_color}` : undefined }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <AdvertiserAvatar name={a.name} logo={a.logo_url} color={a.brand_color} size={60} imageBase={imageBase} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "21px", fontWeight: 800, color: "var(--text)", overflowWrap: "anywhere" }}>{a.name}</h1>
            {details.length > 0 && <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "2px", lineHeight: 1.6 }}>{details.join(", ")}</p>}
            {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--blue)" }} dir="ltr">{a.website.replace(/^https:\/\//, "")}</a>}
          </div>
          {a.archived_at && <Tag tone="muted">בארכיון</Tag>}
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "13px", color: "var(--text-2)" }} data-advertiser-brand-view="">
          <span>לוגו: {a.logo_url ? "יש" : "אין"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>צבע מותג: {a.brand_color ? <><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "5px", background: a.brand_color }} /><bdi dir="ltr">{a.brand_color}</bdi></> : "אין (הכפתור בצבע של bloc)"}</span>
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {!a.archived_at && <Link href={`/ads/new?advertiser=${a.id}`} style={{ ...solidBtn("var(--blue)"), minHeight: "44px", textDecoration: "none" }} data-advertiser-new-campaign=""><Plus size={16} />קמפיין חדש</Link>}
            <button type="button" style={ghostBtn} onClick={() => setEdit(true)} data-adv-edit={a.id}><Pencil size={15} />עריכה ומותג</button>
            <button type="button" style={ghostBtn} disabled={!!busy}
              onClick={() => void act("arc", { action: "advertiser.archive", id: a.id, archived: !a.archived_at }, a.archived_at ? "המפרסם חזר מהארכיון." : "המפרסם הועבר לארכיון.")}>
              {a.archived_at ? <><ArchiveRestore size={15} />החזרה מהארכיון</> : <><Archive size={15} />לארכיון</>}
            </button>
            {a.contracts.length === 0 && (
              <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} disabled={!!busy}
                onClick={() => void act("del", { action: "advertiser.delete", id: a.id }, "המפרסם נמחק.", `למחוק את ${a.name}?`, () => router.replace("/ads/advertisers"))}>
                <Trash2 size={15} />מחיקה
              </button>
            )}
          </div>
        )}
      </header>
      {notice && <Banner tone="ok"><span data-ads-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-ads-error="">{err}</span></Banner>}

      <section style={{ display: "flex", flexDirection: "column", gap: "8px" }} aria-label="חוזים" data-advertiser-contracts={a.contracts.length}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>חוזים</h2>
          {canManage && !a.archived_at && <button type="button" style={ghostBtn} onClick={() => setCon("new")} data-adv-new-contract={a.id}><Plus size={15} />חוזה</button>}
        </div>
        {a.contracts.length === 0 && <p style={{ fontSize: "14px", color: "var(--text-2)" }}>אין חוזים.</p>}
        {a.contracts.map((k) => (
          <div key={k.id} className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }} data-contract-card={k.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{k.reference ? ltr(k.reference) : "בלי מספר"}</div>
                <div className="studio-num" style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "2px" }}>{fmtIls(k.price_ils)} {PRICING_LABEL[k.pricing]} · {fmtRange(k.starts_on, k.ends_on)}{k.impression_cap ? ` · עד ${fmtInt(k.impression_cap)} חשיפות` : ""}</div>
              </div>
              <Tag tone={contractTone(k, today)}>{contractLabel(k, today)}</Tag>
            </div>
            <div className="studio-num" style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-2)" }}>
              <span>{fmtInt(k.views)} חשיפות</span><span>{fmtInt(k.clicks)} הקלקות</span><span>שווי <b style={{ color: "var(--text)" }}>{fmtIls(k.value)}</b></span>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {canManage && <button type="button" style={{ ...ghostBtn, minHeight: "40px" }} onClick={() => setCon(k)} data-contract-edit={k.id}><Pencil size={14} />עריכה</button>}
              {k.document_url && <a href={k.document_url} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, minHeight: "40px", textDecoration: "none" }}><FileText size={14} />המסמך</a>}
              {canManage && k.campaigns === 0 && (
                <button type="button" style={{ ...ghostBtn, minHeight: "40px", color: "var(--red)" }} disabled={!!busy}
                  onClick={() => void act(`k-${k.id}`, { action: "contract.delete", id: k.id }, "החוזה נמחק.", "למחוק את החוזה?")} data-contract-delete={k.id}>
                  <Trash2 size={14} />מחיקה
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "8px" }} aria-label="קמפיינים" data-advertiser-campaigns={mine.length}>
        <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>קמפיינים</h2>
        {mine.length === 0 && <p style={{ fontSize: "14px", color: "var(--text-2)" }}>אין קמפיינים עדיין.</p>}
        {mine.map((c) => (
          <Link key={c.id} href={`/ads/campaigns/${c.id}`} className="card" data-advertiser-campaign={c.id}
            style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px", textDecoration: "none", color: "var(--text)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "14.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <Tag tone={c.tone as Tone}>{c.phase_label}</Tag>
            </div>
            <PlacementIcons formats={c.placements} />
            <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{fmtRange(c.starts_on, c.ends_on)} · {fmtInt(c.views)} חשיפות · CTR {fmtCtr(c.views, c.clicks)}</span>
          </Link>
        ))}
      </section>

      {edit && (
        <Sheet title={`עריכה: ${a.name}`} onClose={() => setEdit(false)} testId="advertiser">
          <AdvertiserForm initial={a} imageBase={imageBase} onCancel={() => setEdit(false)} onSaved={(m) => { setEdit(false); done(m); }} />
        </Sheet>
      )}
      {con && (
        <Sheet title={con === "new" ? `חוזה חדש: ${a.name}` : `עריכת חוזה: ${a.name}`} onClose={() => setCon(null)} testId="contract">
          <ContractForm advertiser={{ id: a.id, name: a.name }} initial={con === "new" ? null : con} onCancel={() => setCon(null)} onSaved={(m) => { setCon(null); done(m); }} />
        </Sheet>
      )}
    </div>
  );
}
