import { NextRequest, NextResponse } from "next/server";

// Webhook endpoint - called when new building is created
// Configure WEBHOOK_URL env var to forward to Slack/WhatsApp/etc

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { event, data } = body;

  // Forward to external webhook (Slack, Make.com, Zapier etc.)
  const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL;
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: formatMessage(event, data),
        event,
        data,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}

function formatMessage(event: string, data: Record<string, unknown>): string {
  switch (event) {
    case "building.created":
      return `בניין חדש נוצר: ${data.name} (${data.plan})`;
    case "tenant.pending":
      return `דייר חדש ממתין לאישור: ${data.full_name} בבניין ${data.building_name}`;
    case "ticket.urgent":
      return `תקלה דחופה: ${data.title} בבניין ${data.building_name}`;
    case "payment.failed":
      return `תשלום נכשל: ₪${data.amount} — ${data.building_name}`;
    default:
      return `אירוע: ${event}`;
  }
}
