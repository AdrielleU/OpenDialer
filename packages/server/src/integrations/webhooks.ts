import { db } from '../db/index.js';
import { settings, contacts, campaigns, users, callLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type WebhookEvent =
  | 'call.completed'
  | 'contact.dispositioned'
  | 'voicemail.dropped'
  | 'session.completed';

async function getWebhookUrl(): Promise<string | null> {
  const row = await db.select().from(settings).where(eq(settings.key, 'WEBHOOK_CRM_URL')).get();
  return row?.value || null;
}

export async function fireWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const url = await getWebhookUrl();
  if (!url) return;

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire and forget with one retry
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // One retry after 2s
    setTimeout(async () => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Give up silently — don't break the dialer for a webhook failure
      }
    }, 2000);
  }
}

// Helper to build enriched webhook payloads
export async function buildCallWebhookData(
  callLogId: number,
): Promise<Record<string, unknown> | null> {
  const callLog = await db.select().from(callLogs).where(eq(callLogs.id, callLogId)).get();
  if (!callLog) return null;

  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, callLog.contactId))
    .get();
  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, callLog.campaignId))
    .get();
  const operator = callLog.operatorId
    ? await db.select().from(users).where(eq(users.id, callLog.operatorId)).get()
    : null;

  return {
    call_id: callLog.id,
    telnyx_call_id: callLog.telnyxCallControlId,
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
        }
      : null,
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    operator: operator ? { id: operator.id, name: operator.name } : null,
    duration_seconds: callLog.durationSeconds,
    talk_time_seconds: callLog.talkTimeSeconds,
    disposition: callLog.disposition,
    recording_url: callLog.recordingUrl,
    notes: callLog.notes,
    started_at: callLog.startedAt,
    ended_at: callLog.endedAt,
  };
}
