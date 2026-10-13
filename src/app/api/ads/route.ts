// src/app/api/ads/route.ts — פרסומות ממומנות (bloc ADS-1, SQL 175; החלטה 75): כל הכתיבות של המסך.
//
//   POST { action, … }  (ads.manage)
//     advertiser.save / .archive / .delete
//     contract.save / .delete
//     campaign.save / .status / .duplicate / .delete
//     creative.save / .active / .delete
//     settings.save — המתג, בניינים בלי פרסומות, מכשירי בדיקה (לפי אימייל של חשבון bloc)
//
// הכתיבה ישירה לטבלאות של bloc (service role); הגבולות — ב-zod (משפט בעברית) וגם ב-CHECK של ה-DB. מה שכבר
// הוצג נשמר ב-DB עצמו (טריגרים ו-FK): מחיר / מודל / מפרסם של חוזה, החוזה של קמפיין, התוכן של פרסומת, ומחיקה
// של מה שיש לו היסטוריה — נענים כאן במשפט שאומר מה כן אפשר. כל פעולה נרשמת ביומן הפאנל (AD_*).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, adActionSchema } from "@/lib/validation";
import { adsDbMessage, adsSqlMissing, ilTodayKey, type DbError } from "@/lib/ads";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for") ?? undefined;
const ok = (body: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...body }, { headers: noStore });
const bad = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

/** שגיאת DB → סטטוס ומשפט. */
function dbFail(e: DbError, fallback: string) {
  const m = e?.message ?? "";
  const status = adsSqlMissing(e) ? 503
    : (e?.code === "23503" || /AD_(CONTRACT|CAMPAIGN|CREATIVE)_LOCKED/.test(m)) ? 409
    : e?.code === "23514" ? 400 : 500;
  if (status === 500) console.error("[ads]", e);
  return bad(adsDbMessage(e, fallback), status);
}

type Row = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.manage" });
  if (!g.ok) return g.response;
  const s = g.session;
  const ip = ipOf(req);

  const parsed = await parseBody(req, adActionSchema);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  switch (b.action) {
    // ── מפרסמים ──
    case "advertiser.save": {
      const { action: _a, id, ...fields } = b;
      const res = id
        ? await adminClient.from("ad_advertisers").update(fields).eq("id", id).select("id").maybeSingle()
        : await adminClient.from("ad_advertisers").insert({ ...fields, created_by: s.email }).select("id").single();
      if (res.error) return dbFail(res.error, "שמירת המפרסם נכשלה. נסו שוב.");
      if (!res.data) return bad("המפרסם לא נמצא", 404);
      const newId = (res.data as Row).id as string;
      await auditLog(s, "AD_ADVERTISER_SAVE", "ad_advertiser", newId, { name: fields.name, created: !id }, ip);
      return ok({ id: newId });
    }
    case "advertiser.archive": {
      const res = await adminClient.from("ad_advertisers")
        .update({ archived_at: b.archived ? new Date().toISOString() : null }).eq("id", b.id).select("id, name").maybeSingle();
      if (res.error) return dbFail(res.error, "העדכון נכשל. נסו שוב.");
      if (!res.data) return bad("המפרסם לא נמצא", 404);
      await auditLog(s, "AD_ADVERTISER_ARCHIVE", "ad_advertiser", b.id, { name: (res.data as Row).name, archived: b.archived }, ip);
      return ok();
    }
    case "advertiser.delete": {
      const res = await adminClient.from("ad_advertisers").delete().eq("id", b.id).select("id, name");
      if (res.error) return dbFail(res.error, "המחיקה נכשלה. נסו שוב.");
      if (!res.data?.length) return bad("המפרסם לא נמצא", 404);
      await auditLog(s, "AD_ADVERTISER_DELETE", "ad_advertiser", b.id, { name: (res.data[0] as Row).name }, ip);
      return ok();
    }

    // ── חוזים ──
    case "contract.save": {
      const { action: _a, id, ...fields } = b;
      const res = id
        ? await adminClient.from("ad_contracts").update(fields).eq("id", id).select("id").maybeSingle()
        : await adminClient.from("ad_contracts").insert({ ...fields, created_by: s.email }).select("id").single();
      if (res.error) return dbFail(res.error, "שמירת החוזה נכשלה. נסו שוב.");
      if (!res.data) return bad("החוזה לא נמצא", 404);
      const newId = (res.data as Row).id as string;
      await auditLog(s, "AD_CONTRACT_SAVE", "ad_contract", newId, {
        created: !id, advertiser_id: fields.advertiser_id, pricing: fields.pricing, price_ils: fields.price_ils,
        impression_cap: fields.impression_cap, starts_on: fields.starts_on, ends_on: fields.ends_on, status: fields.status,
      }, ip);
      return ok({ id: newId });
    }
    case "contract.delete": {
      const res = await adminClient.from("ad_contracts").delete().eq("id", b.id).select("id, reference");
      if (res.error) return dbFail(res.error, "המחיקה נכשלה. נסו שוב.");
      if (!res.data?.length) return bad("החוזה לא נמצא", 404);
      await auditLog(s, "AD_CONTRACT_DELETE", "ad_contract", b.id, { reference: (res.data[0] as Row).reference ?? null }, ip);
      return ok();
    }

    // ── קמפיינים ──
    case "campaign.save": {
      const { action: _a, id, ...fields } = b;
      const res = id
        ? await adminClient.from("ad_campaigns").update(fields).eq("id", id).select("id").maybeSingle()
        : await adminClient.from("ad_campaigns").insert({ ...fields, status: "draft", created_by: s.email }).select("id").single();
      if (res.error) return dbFail(res.error, "שמירת הקמפיין נכשלה. נסו שוב.");
      if (!res.data) return bad("הקמפיין לא נמצא", 404);
      const newId = (res.data as Row).id as string;
      await auditLog(s, "AD_CAMPAIGN_SAVE", "ad_campaign", newId, {
        created: !id, name: fields.name, contract_id: fields.contract_id, starts_on: fields.starts_on, ends_on: fields.ends_on,
        goal_views: fields.goal_views, plans: fields.plans, screens: fields.screens,
      }, ip);
      return ok({ id: newId });
    }
    case "campaign.status": {
      const cur = await adminClient.from("ad_campaigns").select("id, name, status, ends_on, contract_id").eq("id", b.id).maybeSingle();
      if (cur.error) return dbFail(cur.error, "העדכון נכשל. נסו שוב.");
      const c = cur.data as Row | null;
      if (!c) return bad("הקמפיין לא נמצא", 404);
      if (c.status === b.status) return ok();
      if (c.status === "ended") return bad("קמפיין שהסתיים לא חוזר לפעול. אפשר לשכפל אותו לקמפיין חדש.", 409);
      if (b.status === "draft") return bad("קמפיין שהופעל לא חוזר לטיוטה. אפשר להשהות אותו.", 409);
      if (b.status === "active") {
        const today = ilTodayKey();
        if (String(c.ends_on) < today) return bad("תאריך הסיום של הקמפיין כבר עבר. עדכנו את התאריכים ושמרו.", 409);
        const k = await adminClient.from("ad_contracts").select("status, ends_on").eq("id", c.contract_id as string).maybeSingle();
        if (k.error) return dbFail(k.error, "העדכון נכשל. נסו שוב.");
        const kr = k.data as Row | null;
        if (!kr || kr.status !== "active") return bad("החוזה של הקמפיין לא פעיל. קודם מפעילים את החוזה.", 409);
        if (String(kr.ends_on) < today) return bad("החוזה של הקמפיין הסתיים.", 409);
        const cr = await adminClient.from("ad_creatives").select("id", { count: "exact", head: true }).eq("campaign_id", b.id).eq("active", true);
        if (cr.error) return dbFail(cr.error, "העדכון נכשל. נסו שוב.");
        if (!cr.count) return bad("אין בקמפיין פרסומת פעילה. מוסיפים פרסומת עם תמונה, ואז מפעילים.", 409);
      }
      const res = await adminClient.from("ad_campaigns").update({ status: b.status }).eq("id", b.id).select("id").maybeSingle();
      if (res.error) return dbFail(res.error, "העדכון נכשל. נסו שוב.");
      await auditLog(s, "AD_CAMPAIGN_STATUS", "ad_campaign", b.id, { name: c.name, from: c.status, to: b.status }, ip);
      return ok();
    }
    case "campaign.duplicate": {
      const cur = await adminClient.from("ad_campaigns").select("*").eq("id", b.id).maybeSingle();
      if (cur.error) return dbFail(cur.error, "השכפול נכשל. נסו שוב.");
      const c = cur.data as Row | null;
      if (!c) return bad("הקמפיין לא נמצא", 404);
      const { id: _id, status: _st, created_at: _ca, created_by: _cb, updated_at: _ua, ...copy } = c;
      const name = `${String(c.name).slice(0, 72)} (עותק)`;
      const ins = await adminClient.from("ad_campaigns").insert({ ...copy, name, status: "draft", created_by: s.email }).select("id").single();
      if (ins.error) return dbFail(ins.error, "השכפול נכשל. נסו שוב.");
      const newId = (ins.data as Row).id as string;
      const crs = await adminClient.from("ad_creatives")
        .select("image_url, image_alt, headline, body, cta_label, cta_url, active").eq("campaign_id", b.id);
      if (!crs.error && crs.data?.length) {
        const rows = (crs.data as Row[]).filter((r) => r.active).map((r) => ({ ...r, campaign_id: newId, created_by: s.email }));
        if (rows.length) {
          const add = await adminClient.from("ad_creatives").insert(rows);
          if (add.error) console.error("[ads] duplicate creatives", add.error);
        }
      }
      await auditLog(s, "AD_CAMPAIGN_DUPLICATE", "ad_campaign", newId, { from: b.id, name }, ip);
      return ok({ id: newId });
    }
    case "campaign.delete": {
      const res = await adminClient.from("ad_campaigns").delete().eq("id", b.id).select("id, name");
      if (res.error) return dbFail(res.error, "המחיקה נכשלה. נסו שוב.");
      if (!res.data?.length) return bad("הקמפיין לא נמצא", 404);
      await auditLog(s, "AD_CAMPAIGN_DELETE", "ad_campaign", b.id, { name: (res.data[0] as Row).name }, ip);
      return ok();
    }

    // ── פרסומות (קריאייטיב) ──
    case "creative.save": {
      const { action: _a, id, ...fields } = b;
      const res = id
        ? await adminClient.from("ad_creatives").update(fields).eq("id", id).select("id").maybeSingle()
        : await adminClient.from("ad_creatives").insert({ ...fields, created_by: s.email }).select("id").single();
      if (res.error) return dbFail(res.error, "שמירת הפרסומת נכשלה. נסו שוב.");
      if (!res.data) return bad("הפרסומת לא נמצאה", 404);
      const newId = (res.data as Row).id as string;
      await auditLog(s, "AD_CREATIVE_SAVE", "ad_creative", newId, { created: !id, campaign_id: fields.campaign_id, headline: fields.headline }, ip);
      return ok({ id: newId });
    }
    case "creative.active": {
      const res = await adminClient.from("ad_creatives").update({ active: b.active }).eq("id", b.id).select("id, headline").maybeSingle();
      if (res.error) return dbFail(res.error, "העדכון נכשל. נסו שוב.");
      if (!res.data) return bad("הפרסומת לא נמצאה", 404);
      await auditLog(s, "AD_CREATIVE_ACTIVE", "ad_creative", b.id, { headline: (res.data as Row).headline, active: b.active }, ip);
      return ok();
    }
    case "creative.delete": {
      const res = await adminClient.from("ad_creatives").delete().eq("id", b.id).select("id, headline");
      if (res.error) return dbFail(res.error, "המחיקה נכשלה. נסו שוב.");
      if (!res.data?.length) return bad("הפרסומת לא נמצאה", 404);
      await auditLog(s, "AD_CREATIVE_DELETE", "ad_creative", b.id, { headline: (res.data[0] as Row).headline }, ip);
      return ok();
    }

    // ── הגדרות ──
    case "settings.save": {
      const patch: Row = { updated_by: s.email };
      if (b.enabled !== undefined) patch.enabled = b.enabled;
      if (b.excluded_buildings) patch.excluded_buildings = [...new Set(b.excluded_buildings)];
      if (b.tester_emails) {
        const emails = [...new Set(b.tester_emails)];
        let ids: string[] = [];
        if (emails.length) {
          const found = await adminClient.from("profiles").select("id, email").in("email", emails);
          if (found.error) return dbFail(found.error, "בדיקת החשבונות נכשלה. נסו שוב.");
          const byEmail = new Map(((found.data ?? []) as Row[]).map((p) => [String(p.email).toLowerCase(), String(p.id)]));
          const missing = emails.filter((e) => !byEmail.has(e));
          if (missing.length) return bad(`אין חשבון bloc עם האימייל: ${missing.join(", ")}`, 400);
          ids = emails.map((e) => byEmail.get(e)!);
        }
        patch.testers = ids;
      }
      const res = await adminClient.from("ad_settings").update(patch).eq("id", 1).select("enabled").maybeSingle();
      if (res.error) return dbFail(res.error, "שמירת ההגדרות נכשלה. נסו שוב.");
      if (!res.data) return bad("ההגדרות לא נמצאו. צריך להריץ את SQL 175 של bloc.", 503);
      await auditLog(s, "AD_SETTINGS", "ad_settings", "1", {
        enabled: b.enabled, excluded: b.excluded_buildings?.length, testers: b.tester_emails?.length,
      }, ip);
      return ok();
    }
  }
}
