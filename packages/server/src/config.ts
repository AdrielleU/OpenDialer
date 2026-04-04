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
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_MFA_SECRET: z.string().optional(),
  DEFAULT_ADMIN_PASSWORD: z.string().optional(),
  DEFAULT_ADMIN_EMAIL: z.string().default('admin@localhost'),
  REQUIRE_MFA: z.coerce.boolean().default(true),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
