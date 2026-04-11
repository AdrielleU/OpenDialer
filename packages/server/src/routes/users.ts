import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getProvider } from '../providers/index.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';

const CreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'operator']).optional(),
});

const UpdateUserSchema = z
  .object({
    email: z.string().email().max(254).optional(),
    name: z.string().min(1).max(200).optional(),
    role: z.enum(['admin', 'operator']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

const ResetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Require admin role for all routes — except /me, which any authenticated
  // user can call to read their own profile (used by the first-login wizard
  // and the layout sidebar).
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/users/me') return;
    if ((request as any).userRole !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required.' });
    }
  });

  // List all users
  fastify.get('/', async () => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        mustSetupMfa: users.mustSetupMfa,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users);
    return rows;
  });

  // Create user
  fastify.post('/', async (request, reply) => {
    const body = validate(CreateUserSchema, request.body, reply);
    if (!body) return;
    const { email, name, role, password } = body;

    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return reply.code(409).send({ error: 'A user with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        role: role || 'operator',
        mustChangePassword: true,
        mustSetupMfa: true,
      })
      .returning();

    // Provision Telnyx SIP credentials for operators
    const connectionId = config.TELNYX_CONNECTION_ID;
    if (connectionId) {
      try {
        const provider = await getProvider();
        const cred = await provider.provisionCredential(
          connectionId,
          `operator-${newUser.id}-${newUser.email}`,
        );
        await db
          .update(users)
          .set({
            sipUsername: cred.sipUsername,
            sipPassword: cred.sipPassword,
            telnyxCredentialId: cred.id,
          })
          .where(eq(users.id, newUser.id));
      } catch (err: any) {
        console.error(`[users] Failed to provision SIP credential for ${email}:`, err.message);
      }
    }

    return reply.code(201).send({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.createdAt,
    });
  });

  // Update user
  fastify.put<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = validate(UpdateUserSchema, request.body, reply);
      if (!body) return;

      const user = await db.select().from(users).where(eq(users.id, id)).get();
      if (!user) return reply.code(404).send({ error: 'User not found.' });

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.role !== undefined) updates.role = body.role;
      if (body.email !== undefined) updates.email = body.email;

      await db.update(users).set(updates).where(eq(users.id, id));
      const updated = await db.select().from(users).where(eq(users.id, id)).get();
      return {
        id: updated!.id,
        email: updated!.email,
        name: updated!.name,
        role: updated!.role,
      };
    },
  );

  // Reset user password (admin sets a temp password)
  fastify.post<{ Params: { id: string } }>(
    '/:id/reset-password',
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = validate(ResetPasswordSchema, request.body, reply);
      if (!body) return;
      const { password } = body;

      const user = await db.select().from(users).where(eq(users.id, id)).get();
      if (!user) return reply.code(404).send({ error: 'User not found.' });

      const passwordHash = await bcrypt.hash(password, 12);
      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: true })
        .where(eq(users.id, id));

      return { message: 'Password reset. User must change it on next login.' };
    },
  );

  // Delete user
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);

    // Prevent deleting yourself
    if ((request as any).userId === id) {
      return reply.code(400).send({ error: 'Cannot delete your own account.' });
    }

    const user = await db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    // Clean up Telnyx credential
    if (user.telnyxCredentialId) {
      try {
        const provider = await getProvider();
        await provider.deleteCredential?.(user.telnyxCredentialId);
      } catch (err: any) {
        console.error(`[users] Failed to delete SIP credential:`, err.message);
      }
    }

    await db.delete(users).where(eq(users.id, id));

    return reply.code(204).send();
  });

  // Get current user profile
  fastify.get('/me', async (request, reply) => {
    const userId = (request as any).userId;
    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      mustSetupMfa: user.mustSetupMfa,
      hasMfa: !!user.mfaSecret,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  });
};
