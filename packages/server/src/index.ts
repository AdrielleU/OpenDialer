import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedDefaultAdmin } from './db/seed.js';
import { buildApp } from './app.js';
import { cleanupOldTranscripts } from './db/cleanup.js';

async function start() {
  await migrate();
  await seedDefaultAdmin();
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  // Run transcript cleanup on startup and every 24 hours
  await cleanupOldTranscripts();
  setInterval(() => cleanupOldTranscripts(), 24 * 60 * 60 * 1000);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
