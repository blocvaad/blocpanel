import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { title, content, priority, building_id } = await req.json();
  if (!title || !content) return NextResponse.json({ error: "title + content required" }, { status: 400 });

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
