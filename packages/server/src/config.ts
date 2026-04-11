import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('./data/opendialer.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().default('http://localhost:3000'),
  PROVIDER: z.enum(['telnyx', 'twilio']).default('telnyx'),
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_CONNECTION_ID: z.string().optional(),
  TELNYX_PHONE_NUMBER: z.string().optional(),
  TELNYX_PUBLIC_KEY: z.string().optional(),
  // If 'true', the /webhooks/telnyx endpoint refuses to process events
  // unless TELNYX_PUBLIC_KEY is set AND the request signature is valid.
  // Defaults to false for dev / first-time setup, but should be ENABLED
  // in production to stop attackers from POSTing fake call events.
  WEBHOOK_REQUIRE_SIGNATURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  DEFAULT_ADMIN_PASSWORD: z.string().optional(),
  DEFAULT_ADMIN_EMAIL: z.string().default('admin@localhost'),
  REQUIRE_MFA: z.string().default('false').transform((v) => v === 'true' || v === '1'),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().default(30),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;

// Guard rail: the Twilio provider is a stub. Allowing PROVIDER=twilio at
// startup means the first call attempt fails with an opaque "not yet
// implemented" runtime error. Refuse to start so the operator gets a clear
// message instead. Skipped during tests so the test runner doesn't exit.
if (config.PROVIDER === 'twilio' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  console.error(
    'PROVIDER=twilio is not yet implemented. Set PROVIDER=telnyx (or remove the variable).',
  );
  process.exit(1);
}
