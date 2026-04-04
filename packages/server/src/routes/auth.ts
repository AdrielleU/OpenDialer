import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import bcrypt from 'bcryptjs';
import { generateSecret, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'opendialer_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

interface SessionData {
  userId: number;
  role: 'admin' | 'operator';
  createdAt: number;
}

// In-memory session store
export const sessions = new Map<string, SessionData>();

function createSession(reply: any, userId: number, role: 'admin' | 'operator'): string {
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, { userId, role, createdAt: Date.now() });
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
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
  // Legacy mode: no users in DB + ADMIN_PASSWORD set → use old env password
  // This is checked at request time via the middleware, not here
  // If we're in multi-user mode, check session
  const session = getSessionData(request);
  return session !== null;
}

// Check if the system is in legacy (env password) mode or multi-user mode
let _isMultiUser: boolean | null = null;
export async function isMultiUserMode(): Promise<boolean> {
  if (_isMultiUser !== null) return _isMultiUser;
  const existing = await db.select().from(users).limit(1);
  _isMultiUser = existing.length > 0;
  return _isMultiUser;
}
export function resetMultiUserCache() {
  _isMultiUser = null;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth status
  fastify.get('/status', async (request) => {
    const multiUser = await isMultiUserMode();
    const session = getSessionData(request);
    const hasWorkos = !!config.WORKOS_API_KEY && !!config.WORKOS_CLIENT_ID;

    if (multiUser && session) {
      const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
      return {
        mode: 'multi-user',
        loggedIn: true,
        hasWorkos,
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

    if (multiUser) {
      return { mode: 'multi-user', loggedIn: false, hasWorkos };
    }

    // Legacy mode
    const hasPassword = !!config.ADMIN_PASSWORD;
    const legacyLoggedIn =
      !hasPassword || (request.cookies?.[SESSION_COOKIE] && sessions.has(request.cookies[SESSION_COOKIE]!));

    return { mode: 'legacy', loggedIn: !!legacyLoggedIn, hasPassword, hasWorkos };
  });

  // Multi-user login: email + password
  fastify.post<{ Body: { email: string; password: string } }>('/login', async (request, reply) => {
    const multiUser = await isMultiUserMode();

    if (!multiUser) {
      // Legacy mode: single password from env
      if (!config.ADMIN_PASSWORD) {
        return reply.code(400).send({ error: 'No password configured.' });
      }
      const { password } = request.body as { password: string };
      if (password !== config.ADMIN_PASSWORD) {
        return reply.code(401).send({ error: 'Invalid password.' });
      }
      if (config.ADMIN_MFA_SECRET) {
        return { requireMfa: true };
      }
      createSession(reply, 0, 'admin'); // userId 0 for legacy
      return { requireMfa: false, message: 'Logged in.' };
    }

    // Multi-user mode
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required.' });
    }

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
      // Temporary session for password change only
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
  fastify.post<{ Body: { email: string; password: string; code: string } }>(
    '/login/mfa',
    async (request, reply) => {
      const multiUser = await isMultiUserMode();

      if (!multiUser) {
        // Legacy MFA
        const { password, code } = request.body as { password: string; code: string };
        if (password !== config.ADMIN_PASSWORD || !config.ADMIN_MFA_SECRET) {
          return reply.code(401).send({ error: 'Invalid credentials.' });
        }
        if (!verifySync({ token: code, secret: config.ADMIN_MFA_SECRET })) {
          return reply.code(401).send({ error: 'Invalid MFA code.' });
        }
        createSession(reply, 0, 'admin');
        return { message: 'Logged in.' };
      }

      const { email, password, code } = request.body as {
        email: string;
        password: string;
        code: string;
      };

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
    },
  );

  // Change password (first-login or voluntary)
  fastify.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/change-password',
    async (request, reply) => {
      const session = getSessionData(request);
      if (!session || session.userId === 0) {
        return reply.code(401).send({ error: 'Not authenticated.' });
      }

      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };

      if (!newPassword || newPassword.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
      }

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
  fastify.get('/mfa-setup', async (request, reply) => {
    const session = getSessionData(request);
    if (!session || session.userId === 0) {
      return reply.code(401).send({ error: 'Not authenticated.' });
    }

    const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const secret = user.mfaSecret || generateSecret();

    // Temporarily store the secret if not yet saved
    if (!user.mfaSecret) {
      await db.update(users).set({ mfaSecret: secret }).where(eq(users.id, session.userId));
    }

    const otpauth = generateURI({ issuer: 'OpenDialer', label: user.email, secret });
    const qrCode = await QRCode.toDataURL(otpauth);

    return { qrCode, secret };
  });

  // MFA setup — verify code
  fastify.post<{ Body: { code: string } }>('/verify-mfa', async (request, reply) => {
    const session = getSessionData(request);
    if (!session || session.userId === 0) {
      return reply.code(401).send({ error: 'Not authenticated.' });
    }

    const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || !user.mfaSecret) {
      return reply.code(400).send({ error: 'MFA not configured. Run setup first.' });
    }

    const { code } = request.body as { code: string };
    if (!verifySync({ token: code, secret: user.mfaSecret })) {
      return reply.code(401).send({ error: 'Invalid code. Try again.' });
    }

    await db
      .update(users)
      .set({ mustSetupMfa: false })
      .where(eq(users.id, session.userId));

    return { message: 'MFA verified and enabled.' };
  });

  // WorkOS SSO
  fastify.get('/workos', async (_request, reply) => {
    if (!config.WORKOS_API_KEY || !config.WORKOS_CLIENT_ID) {
      return reply.code(400).send({ error: 'WorkOS not configured.' });
    }
    const { WorkOS } = await import('@workos-inc/node');
    const workos = new WorkOS(config.WORKOS_API_KEY);
    const redirectUri = `${config.WEBHOOK_BASE_URL}/api/auth/workos/callback`;
    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      redirectUri,
      clientId: config.WORKOS_CLIENT_ID,
    });
    return reply.redirect(authorizationUrl);
  });

  fastify.get<{ Querystring: { code?: string } }>('/workos/callback', async (request, reply) => {
    if (!config.WORKOS_API_KEY || !config.WORKOS_CLIENT_ID) {
      return reply.code(400).send({ error: 'WorkOS not configured.' });
    }
    const { code } = request.query;
    if (!code) return reply.code(400).send({ error: 'Missing authorization code.' });

    try {
      const { WorkOS } = await import('@workos-inc/node');
      const workos = new WorkOS(config.WORKOS_API_KEY);
      const { user: workosUser } = await workos.userManagement.authenticateWithCode({
        code,
        clientId: config.WORKOS_CLIENT_ID,
      });

      // Find or create user by email
      let user = await db
        .select()
        .from(users)
        .where(eq(users.email, workosUser.email))
        .get();

      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({
            email: workosUser.email,
            name: workosUser.firstName
              ? `${workosUser.firstName} ${workosUser.lastName || ''}`.trim()
              : workosUser.email,
            passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
            role: 'operator',
            mustChangePassword: false,
            mustSetupMfa: false,
          })
          .returning();
        user = newUser;
        resetMultiUserCache();
      }

      createSession(reply, user.id, user.role as 'admin' | 'operator');
      return reply.redirect('/');
    } catch (err: any) {
      return reply.code(401).send({ error: 'WorkOS auth failed: ' + err.message });
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (sessionId) sessions.delete(sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: 'Logged out.' };
  });
};
