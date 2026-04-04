import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './app.js';

async function start() {
  await migrate();
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
