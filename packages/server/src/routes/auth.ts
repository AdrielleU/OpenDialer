import type { FastifyPluginAsync } from 'fastify';
import { generateSecret, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

export const SESSION_COOKIE = 'opendialer_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

// In-memory session store (single-user, resets on restart)
export const sessions = new Map<string, { createdAt: number }>();

function createSession(reply: any): string {
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, { createdAt: Date.now() });
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return sessionId;
}

export function isAuthenticated(request: any): boolean {
  // No password configured = no auth required
  if (!config.ADMIN_PASSWORD) return true;

  const sessionId = request.cookies?.[SESSION_COOKIE];
  if (!sessionId) return false;

  const session = sessions.get(sessionId);
  if (!session) return false;

  if (Date.now() - session.createdAt > SESSION_MAX_AGE * 1000) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth status — what's configured and is user logged in?
  fastify.get('/status', async (request) => {
    const hasPassword = !!config.ADMIN_PASSWORD;
    const hasMfa = !!config.ADMIN_MFA_SECRET;
    const hasWorkos = !!config.WORKOS_API_KEY && !!config.WORKOS_CLIENT_ID;
    const loggedIn = isAuthenticated(request);

    return { hasPassword, hasMfa, hasWorkos, loggedIn };
  });

  // Login with password
  fastify.post<{ Body: { password: string } }>('/login', async (request, reply) => {
    if (!config.ADMIN_PASSWORD) {
      return reply.code(400).send({ error: 'No ADMIN_PASSWORD configured in .env' });
    }

    const { password } = request.body as { password: string };

    if (password !== config.ADMIN_PASSWORD) {
      return reply.code(401).send({ error: 'Invalid password.' });
    }

    // If MFA is configured, require code
    if (config.ADMIN_MFA_SECRET) {
      return { requireMfa: true };
    }

    createSession(reply);
    return { requireMfa: false, message: 'Logged in.' };
  });

  // Login step 2: MFA code
  fastify.post<{ Body: { password: string; code: string } }>('/login/mfa', async (request, reply) => {
    if (!config.ADMIN_PASSWORD || !config.ADMIN_MFA_SECRET) {
      return reply.code(400).send({ error: 'MFA not configured.' });
    }

    const { password, code } = request.body as { password: string; code: string };

    if (password !== config.ADMIN_PASSWORD) {
      return reply.code(401).send({ error: 'Invalid password.' });
    }

    const valid = verifySync({ token: code, secret: config.ADMIN_MFA_SECRET });
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid MFA code.' });
    }

    createSession(reply);
    return { message: 'Logged in.' };
  });

  // Generate MFA QR code (for initial setup — user puts secret in .env)
  fastify.get('/mfa-setup', async (request, reply) => {
    if (!isAuthenticated(request)) {
      return reply.code(401).send({ error: 'Login first.' });
    }

    const secret = config.ADMIN_MFA_SECRET || generateSecret();
    const otpauth = generateURI({ issuer: 'OpenDialer', label: 'admin', secret });
    const qrCode = await QRCode.toDataURL(otpauth);

    return {
      qrCode,
      secret,
      instructions: config.ADMIN_MFA_SECRET
        ? 'Scan this QR code with your authenticator app.'
        : 'Scan this QR code, then add ADMIN_MFA_SECRET=' + secret + ' to your .env file and restart.',
    };
  });

  // WorkOS SSO — redirect to WorkOS AuthKit
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

  // WorkOS SSO callback
  fastify.get<{ Querystring: { code?: string } }>('/workos/callback', async (request, reply) => {
    if (!config.WORKOS_API_KEY || !config.WORKOS_CLIENT_ID) {
      return reply.code(400).send({ error: 'WorkOS not configured.' });
    }

    const { code } = request.query;
    if (!code) {
      return reply.code(400).send({ error: 'Missing authorization code.' });
    }

    try {
      const { WorkOS } = await import('@workos-inc/node');
      const workos = new WorkOS(config.WORKOS_API_KEY);
      await workos.userManagement.authenticateWithCode({
        code,
        clientId: config.WORKOS_CLIENT_ID,
      });

      createSession(reply);
      return reply.redirect('/');
    } catch (err: any) {
      return reply.code(401).send({ error: 'WorkOS authentication failed: ' + err.message });
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
