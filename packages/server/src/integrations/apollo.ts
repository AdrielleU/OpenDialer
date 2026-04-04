import { db } from '../db/index.js';
import { settings, contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function getApolloApiKey(): Promise<string | null> {
  const row = await db.select().from(settings).where(eq(settings.key, 'APOLLO_API_KEY')).get();
  return row?.value || null;
}

export async function testApolloConnection(): Promise<{ ok: boolean; message: string }> {
  const apiKey = await getApolloApiKey();
  if (!apiKey) return { ok: false, message: 'No Apollo API key configured.' };

  try {
    const res = await fetch('https://api.apollo.io/v1/contacts/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ per_page: 1, page: 1 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, message: 'Connected to Apollo.' };
  } catch (err: any) {
    return { ok: false, message: `Apollo error: ${err.message}` };
  }
}

export async function importApolloContacts(
  campaignId: number,
  options: { query?: string; limit?: number } = {},
): Promise<{ imported: number }> {
  const apiKey = await getApolloApiKey();
  if (!apiKey) throw new Error('Apollo not configured.');

  const limit = options.limit || 100;
  let imported = 0;
  let page = 1;

  while (imported < limit) {
    const perPage = Math.min(100, limit - imported);
    const res = await fetch('https://api.apollo.io/v1/contacts/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({
        q_keywords: options.query || '',
        per_page: perPage,
        page,
      }),
    });

    if (!res.ok) throw new Error(`Apollo API error: HTTP ${res.status}`);
    const data = await res.json();
    const apolloContacts = data.contacts || [];

    if (apolloContacts.length === 0) break;

    const values = apolloContacts
      .map((ac: any) => {
        const phoneNumbers = ac.phone_numbers || [];
        const phone = phoneNumbers[0]?.sanitized_number || phoneNumbers[0]?.raw_number;
        if (!phone) return null;

        const firstName = ac.first_name || '';
        const lastName = ac.last_name || '';
        const name = `${firstName} ${lastName}`.trim() || null;

        return {
          campaignId,
          name,
          phone,
          company: ac.organization_name || null,
          email: ac.email || null,
          apolloContactId: ac.id,
        };
      })
      .filter((v: any): v is NonNullable<typeof v> => v !== null);

    if (values.length > 0) {
      await db.insert(contacts).values(values);
      imported += values.length;
    }

    page++;
    if (apolloContacts.length < perPage) break;
  }

  return { imported };
}
