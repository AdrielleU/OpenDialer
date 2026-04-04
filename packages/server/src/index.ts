import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedDefaultAdmin } from './db/seed.js';
import { buildApp } from './app.js';

async function start() {
  await migrate();
  await seedDefaultAdmin();
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
