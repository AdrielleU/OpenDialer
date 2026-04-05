import { db } from './index.js';
import { users } from './schema.js';
import { config } from '../config.js';
import bcrypt from 'bcryptjs';

export async function seedDefaultAdmin() {
  // Check if any users exist
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) return;

  const defaultPassword = config.DEFAULT_ADMIN_PASSWORD;
  if (!defaultPassword) return;

  const email = config.DEFAULT_ADMIN_EMAIL || 'admin@localhost';
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  await db.insert(users).values({
    email,
    name: 'Admin',
    passwordHash,
    role: 'admin',
    mustChangePassword: true,
    mustSetupMfa: config.REQUIRE_MFA,
  });

  console.log(`[seed] Default admin created: ${email} (password must be changed on first login)`);
}
