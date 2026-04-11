import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedDefaultAdmin } from './db/seed.js';
import { buildApp } from './app.js';
import { cleanupOldTranscripts } from './db/cleanup.js';
import { cleanupExpiredSessions } from './routes/auth.js';
import { cleanupOrphanedAmdTimeouts } from './webhooks/telnyx.js';

async function start() {
  await migrate();
  await seedDefaultAdmin();
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  // Run all in-memory + db cleanup tasks on startup and every 24 hours.
  // None of these block startup if they fail — we just log and continue.
  const runCleanup = async () => {
    await cleanupOldTranscripts().catch((err) =>
      console.error('[cleanup] transcripts failed:', err?.message ?? err),
    );
    cleanupExpiredSessions();
    cleanupOrphanedAmdTimeouts();
  };
  await runCleanup();
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
