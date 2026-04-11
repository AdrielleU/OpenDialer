import type { FastifyReply } from 'fastify';
import type { ZodTypeAny, z } from 'zod';

/**
 * Parse a request body against a Zod schema. On failure, sends a 400 response
 * with a structured error and returns `null`. Callers should `return` early
 * when the result is null.
 *
 * Usage:
 *   const body = validate(MySchema, request.body, reply);
 *   if (!body) return;
 */
export function validate<S extends ZodTypeAny>(
  schema: S,
  body: unknown,
  reply: FastifyReply,
): z.infer<S> | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({
      error: 'Validation failed',
      details: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}

/** E.164 phone number — leading +, 6–15 digits. */
export const phoneE164 = /^\+\d{6,15}$/;
