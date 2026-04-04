import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// --- Settings ---
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// --- Campaigns ---
export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  callerId: text('caller_id').notNull(),
  openerRecordingId: integer('opener_recording_id').references(() => recordings.id),
  voicemailRecordingId: integer('voicemail_recording_id').references(() => recordings.id),
  enableTranscription: integer('enable_transcription', { mode: 'boolean' }).notNull().default(false),
  transcriptionEngine: text('transcription_engine', {
    enum: ['telnyx', 'google', 'deepgram', 'azure'],
  }).default('telnyx'),
  status: text('status', { enum: ['draft', 'active', 'paused', 'completed'] })
    .notNull()
    .default('draft'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  openerRecording: one(recordings, {
    fields: [campaigns.openerRecordingId],
    references: [recordings.id],
    relationName: 'openerRecording',
  }),
  voicemailRecording: one(recordings, {
    fields: [campaigns.voicemailRecordingId],
    references: [recordings.id],
    relationName: 'voicemailRecording',
  }),
  contacts: many(contacts),
  callLogs: many(callLogs),
}));

// --- Contacts ---
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name'),
  phone: text('phone').notNull(),
  company: text('company'),
  email: text('email'),
  notes: text('notes'),
  status: text('status', {
    enum: ['pending', 'voicemail', 'connected', 'no_answer', 'callback', 'not_interested', 'dnc'],
  })
    .notNull()
    .default('pending'),
  callCount: integer('call_count').notNull().default(0),
  lastCalledAt: text('last_called_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [contacts.campaignId],
    references: [campaigns.id],
  }),
  callLogs: many(callLogs),
}));

// --- Recordings ---
export const recordings = sqliteTable('recordings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', { enum: ['opener', 'voicemail'] }).notNull(),
  filePath: text('file_path').notNull(),
  durationSeconds: integer('duration_seconds'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- Call Logs ---
export const callLogs = sqliteTable('call_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  contactId: integer('contact_id')
    .notNull()
    .references(() => contacts.id),
  telnyxCallControlId: text('telnyx_call_control_id'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  durationSeconds: integer('duration_seconds'),
  disposition: text('disposition', {
    enum: ['voicemail', 'connected', 'no_answer', 'busy', 'failed'],
  }),
  recordingUrl: text('recording_url'),
  humanTookOver: integer('human_took_over', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
});

export const callLogsRelations = relations(callLogs, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [callLogs.campaignId],
    references: [campaigns.id],
  }),
  contact: one(contacts, {
    fields: [callLogs.contactId],
    references: [contacts.id],
  }),
}));

// --- Transcripts ---
export const transcripts = sqliteTable('transcripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callLogId: integer('call_log_id')
    .notNull()
    .references(() => callLogs.id, { onDelete: 'cascade' }),
  speaker: text('speaker', { enum: ['inbound', 'outbound'] }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  callLog: one(callLogs, {
    fields: [transcripts.callLogId],
    references: [callLogs.id],
  }),
}));

// --- Inferred Types ---
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type CallLog = typeof callLogs.$inferSelect;
export type NewCallLog = typeof callLogs.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
