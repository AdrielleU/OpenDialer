import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { callLogs, contacts, campaigns } from '../db/schema.js';
import { eq, sql, and, gte, lte, count } from 'drizzle-orm';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Campaign summary stats
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/stats',
    async (request, reply) => {
      const campaignId = Number(request.params.campaignId);

      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .get();
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

      // Contact status breakdown
      const contactStats = await db
        .select({
          status: contacts.status,
          count: count(),
        })
        .from(contacts)
        .where(eq(contacts.campaignId, campaignId))
        .groupBy(contacts.status);

      // Call disposition breakdown
      const callStats = await db
        .select({
          disposition: callLogs.disposition,
          count: count(),
        })
        .from(callLogs)
        .where(eq(callLogs.campaignId, campaignId))
        .groupBy(callLogs.disposition);

      // Aggregate call metrics
      const metrics = await db
        .select({
          totalCalls: count(),
          totalDuration: sql<number>`COALESCE(SUM(${callLogs.durationSeconds}), 0)`,
          avgDuration: sql<number>`COALESCE(AVG(${callLogs.durationSeconds}), 0)`,
          humanTakeovers: sql<number>`SUM(CASE WHEN ${callLogs.humanTookOver} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(callLogs)
        .where(eq(callLogs.campaignId, campaignId))
        .get();

      const totalContacts = contactStats.reduce((sum, s) => sum + s.count, 0);
      const pendingContacts = contactStats.find((s) => s.status === 'pending')?.count ?? 0;

      return {
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
        contacts: {
          total: totalContacts,
          pending: pendingContacts,
          completed: totalContacts - pendingContacts,
          breakdown: Object.fromEntries(contactStats.map((s) => [s.status, s.count])),
        },
        calls: {
          total: metrics?.totalCalls ?? 0,
          totalDurationSeconds: metrics?.totalDuration ?? 0,
          avgDurationSeconds: Math.round(metrics?.avgDuration ?? 0),
          humanTakeovers: metrics?.humanTakeovers ?? 0,
          breakdown: Object.fromEntries(callStats.map((s) => [s.disposition ?? 'unknown', s.count])),
        },
      };
    },
  );

  // Export contacts as CSV
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/export/contacts',
    async (request, reply) => {
      const campaignId = Number(request.params.campaignId);
      const rows = await db
        .select()
        .from(contacts)
        .where(eq(contacts.campaignId, campaignId));

      const csv = toCsv(rows, [
        'id', 'name', 'phone', 'company', 'email', 'notes',
        'status', 'callCount', 'lastCalledAt', 'createdAt',
      ]);

      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="contacts-campaign-${campaignId}.csv"`)
        .send(csv);
    },
  );

  // Export call logs as CSV
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/export/calls',
    async (request, reply) => {
      const campaignId = Number(request.params.campaignId);

      const rows = await db
        .select({
          callId: callLogs.id,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          contactCompany: contacts.company,
          startedAt: callLogs.startedAt,
          endedAt: callLogs.endedAt,
          durationSeconds: callLogs.durationSeconds,
          disposition: callLogs.disposition,
          humanTookOver: callLogs.humanTookOver,
          notes: callLogs.notes,
          recordingUrl: callLogs.recordingUrl,
        })
        .from(callLogs)
        .leftJoin(contacts, eq(callLogs.contactId, contacts.id))
        .where(eq(callLogs.campaignId, campaignId))
        .orderBy(callLogs.startedAt);

      const csv = toCsv(rows, [
        'callId', 'contactName', 'contactPhone', 'contactCompany',
        'startedAt', 'endedAt', 'durationSeconds', 'disposition',
        'humanTookOver', 'notes', 'recordingUrl',
      ]);

      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="call-logs-campaign-${campaignId}.csv"`)
        .send(csv);
    },
  );

  // Export all campaigns summary as CSV
  fastify.get('/export/summary', async (_request, reply) => {
    const rows = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        status: campaigns.status,
        callerId: campaigns.callerId,
        totalContacts: sql<number>`(SELECT COUNT(*) FROM contacts WHERE campaign_id = ${campaigns.id})`,
        pendingContacts: sql<number>`(SELECT COUNT(*) FROM contacts WHERE campaign_id = ${campaigns.id} AND status = 'pending')`,
        voicemails: sql<number>`(SELECT COUNT(*) FROM call_logs WHERE campaign_id = ${campaigns.id} AND disposition = 'voicemail')`,
        connects: sql<number>`(SELECT COUNT(*) FROM call_logs WHERE campaign_id = ${campaigns.id} AND disposition = 'connected')`,
        noAnswers: sql<number>`(SELECT COUNT(*) FROM call_logs WHERE campaign_id = ${campaigns.id} AND disposition = 'no_answer')`,
        totalCalls: sql<number>`(SELECT COUNT(*) FROM call_logs WHERE campaign_id = ${campaigns.id})`,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns);

    const csv = toCsv(rows, [
      'campaignId', 'campaignName', 'status', 'callerId',
      'totalContacts', 'pendingContacts', 'voicemails', 'connects',
      'noAnswers', 'totalCalls', 'createdAt',
    ]);

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="campaigns-summary.csv"')
      .send(csv);
  });
};

// Simple CSV serializer — no external dependency needed
function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.join(',');
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
