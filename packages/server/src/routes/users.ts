import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { resetMultiUserCache } from './auth.js';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Require admin role for all routes
  fastify.addHook('onRequest', async (request, reply) => {
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
  fastify.post<{
    Body: { email: string; name: string; role?: 'admin' | 'operator'; password: string };
  }>('/', async (request, reply) => {
    const { email, name, role, password } = request.body as {
      email: string;
      name: string;
      role?: 'admin' | 'operator';
      password: string;
    };

    if (!email || !name || !password) {
      return reply.code(400).send({ error: 'Email, name, and password are required.' });
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
    }

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

    resetMultiUserCache();

    return reply.code(201).send({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.createdAt,
    });
  });

  // Update user
  fastify.put<{ Params: { id: string }; Body: { name?: string; role?: string; email?: string } }>(
    '/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = request.body as { name?: string; role?: string; email?: string };

      const user = await db.select().from(users).where(eq(users.id, id)).get();
      if (!user) return reply.code(404).send({ error: 'User not found.' });

      const updates: Record<string, unknown> = {};
      if (body.name) updates.name = body.name;
      if (body.role) updates.role = body.role;
      if (body.email) updates.email = body.email;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: 'Nothing to update.' });
      }

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
  fastify.post<{ Params: { id: string }; Body: { password: string } }>(
    '/:id/reset-password',
    async (request, reply) => {
      const id = Number(request.params.id);
      const { password } = request.body as { password: string };

      if (!password || password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
      }

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

    await db.delete(users).where(eq(users.id, id));
    resetMultiUserCache();

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
