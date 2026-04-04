import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('./data/opendialer.db'),
  WEBHOOK_BASE_URL: z.string().default('http://localhost:3000'),
  PROVIDER: z.enum(['telnyx', 'twilio']).default('telnyx'),
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_CONNECTION_ID: z.string().optional(),
  TELNYX_PHONE_NUMBER: z.string().optional(),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
