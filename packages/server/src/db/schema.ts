import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// --- Settings ---
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// --- Users ---
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  mfaSecret: text('mfa_secret'),
  role: text('role', { enum: ['admin', 'operator'] }).notNull().default('operator'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
  mustSetupMfa: integer('must_setup_mfa', { mode: 'boolean' }).notNull().default(true),
  sipUsername: text('sip_username'),
  sipPassword: text('sip_password'),
  telnyxCredentialId: text('telnyx_credential_id'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastLoginAt: text('last_login_at'),
});

// --- Campaigns ---
export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  callerId: text('caller_id').notNull(),
  openerRecordingId: integer('opener_recording_id').references(() => recordings.id),
  voicemailRecordingId: integer('voicemail_recording_id').references(() => recordings.id),
  enableTranscription: integer('enable_transcription', { mode: 'boolean' }).notNull().default(false),
  // 'off'      — no transcription
  // 'realtime' — stream during the call via Telnyx built-in transcription
  // 'post_call'— transcribe the recording after hangup (cheap batch)
  transcriptionMode: text('transcription_mode', {
    enum: ['off', 'realtime', 'post_call'],
  })
    .notNull()
    .default('off'),
  dropIfNoOperator: integer('drop_if_no_operator', { mode: 'boolean' }).notNull().default(true),
  // Retry/priority knobs. maxAttempts=1 means "call once" (current behavior);
  // raise to allow voicemail-receiving contacts to be re-dialed.
  // retryAfterMinutes is the minimum gap between attempts on the same contact.
  // prioritizeVoicemails dials contacts that have already heard a voicemail
  // before fresh contacts — second/third touches tend to convert higher.
  maxAttempts: integer('max_attempts').notNull().default(1),
  retryAfterMinutes: integer('retry_after_minutes').notNull().default(60),
  prioritizeVoicemails: integer('prioritize_voicemails', { mode: 'boolean' })
    .notNull()
    .default(true),
  ivrSequence: text('ivr_sequence'),
  ivrGreetingType: text('ivr_greeting_type', { enum: ['none', 'recording', 'tts'] }).default('none'),
  ivrGreetingTemplate: text('ivr_greeting_template'),
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
  ivrSequence: text('ivr_sequence'),
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
  userId: integer('user_id').references(() => users.id),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- Recording Profiles ---
export const recordingProfiles = sqliteTable('recording_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  openerRecordingId: integer('opener_recording_id').references(() => recordings.id),
  voicemailRecordingId: integer('voicemail_recording_id').references(() => recordings.id),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const recordingProfilesRelations = relations(recordingProfiles, ({ one }) => ({
  user: one(users, {
    fields: [recordingProfiles.userId],
    references: [users.id],
  }),
  openerRecording: one(recordings, {
    fields: [recordingProfiles.openerRecordingId],
    references: [recordings.id],
    relationName: 'profileOpener',
  }),
  voicemailRecording: one(recordings, {
    fields: [recordingProfiles.voicemailRecordingId],
    references: [recordings.id],
    relationName: 'profileVoicemail',
  }),
}));

// --- Call Logs ---
export const callLogs = sqliteTable('call_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  contactId: integer('contact_id')
    .notNull()
    .references(() => contacts.id),
  operatorId: integer('operator_id').references(() => users.id),
  // The first operator who took the call before any transfer. NULL for
  // calls that never transferred. When set, operatorId is the *current*
  // operator and originalOperatorId is the one who was originally bridged.
  originalOperatorId: integer('original_operator_id').references(() => users.id),
  // ISO timestamp when transferCall() bridged this call to a new operator.
  transferredAt: text('transferred_at'),
  telnyxCallControlId: text('telnyx_call_control_id'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  durationSeconds: integer('duration_seconds'),
  talkTimeSeconds: integer('talk_time_seconds'),
  disposition: text('disposition', {
    enum: [
      'voicemail',
      'connected',
      'no_answer',
      'busy',
      'failed',
      // Richer hangup-before-answer dispositions added 2026-04
      'ringing_abandoned', // contact hung up before AMD started
      'amd_abandoned', // contact hung up while AMD was running
    ],
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
  operator: one(users, {
    fields: [callLogs.operatorId],
    references: [users.id],
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
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type RecordingProfile = typeof recordingProfiles.$inferSelect;
export type NewRecordingProfile = typeof recordingProfiles.$inferInsert;
export type CallLog = typeof callLogs.$inferSelect;
export type NewCallLog = typeof callLogs.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
