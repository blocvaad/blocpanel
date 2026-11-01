// src/app/api/collection-providers/route.ts — מתג לכל ספק סליקה (bloc PAY-M, SQL 202).
//
// סופר-אדמין בלבד: המתג משנה מה כל הוועדים רואים במסך אמצעי התשלום. כיבוי לא עוצר בניין שכבר מחובר (ראה
// lib/collectionProviders). כל שינוי נרשם ביומן הפעולות — עם כמה בניינים היו מחוברים לספק ברגע השינוי.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, collectionProviderSchema } from "@/lib/validation";
import { COLLECTION_PROVIDERS, isMissing202 } from "@/lib/collectionProviders";

const NEEDS_202 = "צריך להריץ קודם את SQL 202 של bloc (ספקי הסליקה).";

export async function POST(req: NextRequest) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const parsed = await parseBody(req, collectionProviderSchema);
  if (!parsed.ok) return parsed.response;
  const { provider, offered } = parsed.data;

  const { data, error } = await adminClient
    .from("platform_payment_providers")
    .update({ offered, updated_at: new Date().toISOString(), updated_by: session.email })
    .eq("provider", provider)
    .select("provider, offered, updated_at, updated_by");
  if (error) {
    if (isMissing202(error)) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });
    console.error("[collection-providers]", error);
    return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב." }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });

  // כמה בניינים מחוברים — ליומן: מה המשמעות של השינוי ברגע שנעשה. כשל בספירה — בלי המספר, השינוי כבר נשמר.
  let buildings: number | null = null;
  const usage = await adminClient.rpc("panel_payment_provider_usage");
  if (!usage.error && Array.isArray(usage.data)) {
    const hit = (usage.data as { provider?: unknown; buildings?: unknown }[]).find((u) => u.provider === provider);
    buildings = Number(hit?.buildings ?? 0) || 0;
  }

  await auditLog(session, offered ? "COLLECTION_PROVIDER_ON" : "COLLECTION_PROVIDER_OFF", "platform", provider, {
    label: COLLECTION_PROVIDERS.find((p) => p.id === provider)?.label ?? provider, offered, buildings,
  }, ip);

  return NextResponse.json({ ok: true, provider: row });
}
