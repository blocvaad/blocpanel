import { NextRequest, NextResponse } from "next/server";
import { requireFullSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { resolveExpiresAt } from "@/lib/expiry";

// Map a requireFullSession failure reason to an HTTP response.
function denied(reason: "unauthenticated"|"mfa_required"|"revoked"|"expired"|"disabled") {
  if (reason === "mfa_required") return NextResponse.json({ error: "נדרש אימות דו-שלבי" }, { status: 401 });
  if (reason === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "ההרשאה בוטלה. התחבר מחדש." }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = await requireFullSession();
  if (!auth.ok) return denied(auth.reason);
  const session = auth.session;
  if (!can(session.role, "broadcast.send")) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { title, content, priority, building_id, expires_in_days } = await req.json();
  if (!title || !content) return NextResponse.json({ error: "title + content required" }, { status: 400 });

  // תפוגה: expires_in_days (יכול להיות שבר עבור שעות). 0/undefined = קבוע (בלי תפוגה).
  const expiresAt = resolveExpiresAt(expires_in_days);

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Get target buildings
  let buildingIds: string[] = [];
  if (building_id) {
    buildingIds = [building_id];
  } else {
    const { data: buildings } = await adminClient.from("buildings").select("id");
    buildingIds = (buildings ?? []).map(b => b.id);
  }

  if (!buildingIds.length) return NextResponse.json({ error: "No buildings" }, { status: 400 });

  // Get a valid author_id (first admin profile)
  const { data: adminProfile } = await adminClient
    .from("profiles").select("id").eq("role", "admin").limit(1).single();

  const emojis: Record<string, string> = { urgent: "🚨", high: "⚠️", normal: "📢", low: "ℹ️" };
  const emoji = emojis[priority ?? "normal"] ?? "📢";

  let sent = 0;
  const errors: string[] = [];

  for (const bid of buildingIds) {
    const { error } = await adminClient.from("announcements").insert({
      title,
      content,
      priority: priority ?? "normal",
      is_pinned: false,
      is_system: true,
      expires_at: expiresAt,
      building_id: bid,
      author_id: adminProfile?.id ?? null,
    });
    if (error) { errors.push(bid); continue; }

    // Notify residents
    const { data: residents } = await adminClient
      .from("profiles")
      .select("id")
      .eq("building_id", bid)
      .eq("approval_status", "approved");

    if (residents?.length) {
      await adminClient.from("notifications").insert(
        residents.map(r => ({
          receiver_id: r.id,
          sender_id: adminProfile?.id ?? null,
          type: "announcement",
          title: `${emoji} ${title}`,
          content: content.slice(0, 200),
          link: "/announcements",
        }))
      );
    }
    sent++;
  }

  await auditLog(session, "BROADCAST", "announcement", undefined, {
    title, priority, buildings: sent, building_id: building_id ?? "all"
  }, ip);

  return NextResponse.json({ ok: true, sent, errors });
}
