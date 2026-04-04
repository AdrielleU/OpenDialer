import { Client } from '@hubspot/api-client';
import { db } from '../db/index.js';
import { settings, contacts, callLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function getHubspotClient(): Promise<Client | null> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'HUBSPOT_ACCESS_TOKEN'))
    .get();
  if (!row?.value) return null;
  return new Client({ accessToken: row.value });
}

export async function testHubspotConnection(): Promise<{ ok: boolean; message: string }> {
  const client = await getHubspotClient();
  if (!client) return { ok: false, message: 'No HubSpot access token configured.' };

  try {
    await client.crm.contacts.basicApi.getPage(1);
    return { ok: true, message: 'Connected to HubSpot.' };
  } catch (err: any) {
    return { ok: false, message: `HubSpot error: ${err.message}` };
  }
}

export async function importHubspotContacts(
  campaignId: number,
  options: { limit?: number } = {},
): Promise<{ imported: number }> {
  const client = await getHubspotClient();
  if (!client) throw new Error('HubSpot not configured.');

  const limit = options.limit || 100;
  let imported = 0;
  let after: string | undefined;

  // Paginate through contacts
  while (imported < limit) {
    const pageSize = Math.min(100, limit - imported);
    const res = await client.crm.contacts.basicApi.getPage(
      pageSize,
      after,
      ['email', 'firstname', 'lastname', 'phone', 'mobilephone', 'company'],
    );

    const hubspotContacts = res.results;
    if (hubspotContacts.length === 0) break;

    const values = hubspotContacts
      .map((hc) => {
        const phone = hc.properties.phone || hc.properties.mobilephone;
        if (!phone) return null;

        const firstName = hc.properties.firstname || '';
        const lastName = hc.properties.lastname || '';
        const name = `${firstName} ${lastName}`.trim() || null;

        return {
          campaignId,
          name,
          phone,
          company: hc.properties.company || null,
          email: hc.properties.email || null,
          hubspotContactId: hc.id,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length > 0) {
      await db.insert(contacts).values(values);
      imported += values.length;
    }

    after = res.paging?.next?.after;
    if (!after) break;
  }

  return { imported };
}

export async function logCallToHubspot(callLogId: number): Promise<void> {
  const client = await getHubspotClient();
  if (!client) return;

  const callLog = await db.select().from(callLogs).where(eq(callLogs.id, callLogId)).get();
  if (!callLog) return;

  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, callLog.contactId))
    .get();
  if (!contact?.hubspotContactId) return;

  // Map disposition to HubSpot call status
  const statusMap: Record<string, string> = {
    connected: 'COMPLETED',
    voicemail: 'COMPLETED',
    no_answer: 'NO_ANSWER',
    busy: 'BUSY',
    failed: 'FAILED',
  };

  try {
    const callObj = await client.crm.objects.calls.basicApi.create({
      properties: {
        hs_timestamp: callLog.startedAt || new Date().toISOString(),
        hs_call_title: 'Outbound call via OpenDialer',
        hs_call_body: callLog.notes || '',
        hs_call_duration: String((callLog.durationSeconds || 0) * 1000),
        hs_call_direction: 'OUTBOUND',
        hs_call_status: statusMap[callLog.disposition || 'no_answer'] || 'COMPLETED',
        hs_call_recording_url: callLog.recordingUrl || '',
      },
    });

    // Associate call with contact
    await (client.crm.objects.calls as any).associationsApi.create(
      callObj.id,
      'contacts',
      contact.hubspotContactId,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
    );
  } catch {
    // Don't fail the dialer for HubSpot errors
  }
}
