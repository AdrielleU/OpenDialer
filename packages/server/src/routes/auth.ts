import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import bcrypt from 'bcryptjs';
import { generateSecret, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { validate } from '../lib/validate.js';

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const LoginMfaSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  code: z.string().min(1).max(10),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

const VerifyMfaSchema = z.object({
  code: z.string().min(1).max(10),
});

export const SESSION_COOKIE = 'opendialer_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

interface SessionData {
  userId: number;
  role: 'admin' | 'operator';
  createdAt: number;
}

// In-memory session store
export const sessions = new Map<string, SessionData>();

/**
 * Sweep the session map for expired entries. The lazy cleanup in
 * `getSessionData` only removes a session when someone tries to use it,
 * so a user who logs in and never returns leaves their session in the map
 * for the full 24h TTL plus forever after. This sweep makes the bound real:
 * after one cycle, the map size is ≤ active sessions.
 *
 * Returns the number of entries removed (useful for tests / logging).
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  const cutoff = SESSION_MAX_AGE * 1000;
  let removed = 0;
  for (const [sessionId, data] of sessions.entries()) {
    if (now - data.createdAt > cutoff) {
      sessions.delete(sessionId);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[auth] Swept ${removed} expired session(s) from memory`);
  }
  return removed;
}

function createSession(reply: any, userId: number, role: 'admin' | 'operator'): string {
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, { userId, role, createdAt: Date.now() });
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    // SameSite=Strict closes the CSRF hole regardless of CORS config: the
    // browser refuses to send this cookie on any cross-site request, so an
    // attacker page on evil.com cannot trigger authenticated state changes
    // even if our CORS policy is permissive (which it has to be for users
    // running behind a Cloudflare Tunnel with a rotating subdomain).
    //
    // Trade-off: clicking a deep link from email/Slack/etc. won't include
    // the cookie on the first request and the user gets bounced to login.
    // Acceptable for an internal admin/operator dashboard.
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return sessionId;
}

export function getSessionData(request: FastifyRequest): SessionData | null {
  const sessionId = request.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_MAX_AGE * 1000) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function isAuthenticated(request: FastifyRequest): boolean {
  return getSessionData(request) !== null;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Rate limit login endpoints: 5 attempts per 30 seconds per IP
  await fastify.register(rateLimit, {
    max: 5,
    timeWindow: 30_000,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many login attempts. Try again in 30 seconds.',
    }),
  });

  // Auth status
  fastify.get('/status', { config: { rateLimit: false } }, async (request) => {
    const session = getSessionData(request);

    if (session) {
      const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
      return {
        loggedIn: true,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              mustChangePassword: user.mustChangePassword,
              mustSetupMfa: user.mustSetupMfa,
            }
          : null,
      };
    }

    return { loggedIn: false };
  });

  // Login: email + password
  fastify.post('/login', async (request, reply) => {
    const body = validate(LoginSchema, request.body, reply);
    if (!body) return;
    const { email, password } = body;

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    // Check if first-login setup is needed
    if (user.mustChangePassword) {
      createSession(reply, user.id, user.role as 'admin' | 'operator');
      return { requirePasswordChange: true };
    }

    if (user.mustSetupMfa && config.REQUIRE_MFA) {
      createSession(reply, user.id, user.role as 'admin' | 'operator');
      return { requireMfaSetup: true };
    }

    if (user.mfaSecret) {
      return { requireMfa: true, userId: user.id };
    }

    // No MFA, no setup needed — log in
    createSession(reply, user.id, user.role as 'admin' | 'operator');
    await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));
    return { message: 'Logged in.' };
  });

  // MFA verification during login
  fastify.post('/login/mfa', async (request, reply) => {
    const body = validate(LoginMfaSchema, request.body, reply);
    if (!body) return;
    const { email, password, code } = body;

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !(await bcrypt.compare(password, user.passwordHash)) || !user.mfaSecret) {
      return reply.code(401).send({ error: 'Invalid credentials.' });
    }

    if (!verifySync({ token: code, secret: user.mfaSecret })) {
      return reply.code(401).send({ error: 'Invalid MFA code.' });
    }

    createSession(reply, user.id, user.role as 'admin' | 'operator');
    await db
      .update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id));
    return { message: 'Logged in.' };
  });

  // Change password (first-login or voluntary)
  fastify.post(
    '/change-password',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const session = getSessionData(request);
      if (!session) {
        return reply.code(401).send({ error: 'Not authenticated.' });
      }

      const body = validate(ChangePasswordSchema, request.body, reply);
      if (!body) return;
      const { currentPassword, newPassword } = body;

      const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
      if (!user) return reply.code(404).send({ error: 'User not found.' });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.code(401).send({ error: 'Current password is incorrect.' });

      const newHash = await bcrypt.hash(newPassword, 12);
      await db
        .update(users)
        .set({ passwordHash: newHash, mustChangePassword: false })
        .where(eq(users.id, session.userId));

      return { message: 'Password changed.' };
    },
  );

  // MFA setup — generate QR code
  fastify.get('/mfa-setup', { config: { rateLimit: false } }, async (request, reply) => {
    const session = getSessionData(request);
    if (!session) {
      return reply.code(401).send({ error: 'Not authenticated.' });
    }

    const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const secret = user.mfaSecret || generateSecret();

    if (!user.mfaSecret) {
      await db.update(users).set({ mfaSecret: secret }).where(eq(users.id, session.userId));
    }

    const otpauth = generateURI({ issuer: 'OpenDialer', label: user.email, secret });
    const qrCode = await QRCode.toDataURL(otpauth);

    return { qrCode, secret };
  });

  // MFA setup — verify code
  fastify.post(
    '/verify-mfa',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const session = getSessionData(request);
      if (!session) {
        return reply.code(401).send({ error: 'Not authenticated.' });
      }

      const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
      if (!user || !user.mfaSecret) {
        return reply.code(400).send({ error: 'MFA not configured. Run setup first.' });
      }

      const parsed = validate(VerifyMfaSchema, request.body, reply);
      if (!parsed) return;
      const { code } = parsed;
      if (!verifySync({ token: code, secret: user.mfaSecret })) {
        return reply.code(401).send({ error: 'Invalid code. Try again.' });
      }

      await db
        .update(users)
        .set({ mustSetupMfa: false })
        .where(eq(users.id, session.userId));

      return { message: 'MFA verified and enabled.' };
    },
  );

  // Logout
  fastify.post('/logout', { config: { rateLimit: false } }, async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (sessionId) sessions.delete(sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: 'Logged out.' };
  });
};
