import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, closeDatabase } from '../../server/db';
import { users } from '../../server/db/schema';
import { hashPassword } from '../../server/auth';
import { roles } from '../../server/permissions';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
assert.equal(process.env.CI, 'true', 'Role fixtures may only run in CI.');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Role fixtures require the disposable local CI database.');
assert.equal(url.pathname, '/ah_crm_ci', 'Never insert quality fixtures into business databases.');
assert.ok(process.env.SEED_PASSWORD, 'The CI seed password is required.');
try {
  await database().transaction(async tx => {
    for (const role of roles) {
      const key = role.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      await tx.insert(users).values({
        id: randomUUID(), name: `Quality ${role}`, email: `quality-${key}@ahinteriors.test`,
        role, department: 'Isolated quality checks', active: true,
        passwordHash: await hashPassword(process.env.SEED_PASSWORD!),
      }).onConflictDoNothing();
    }
  });
  console.log('Synthetic role fixtures created in the disposable CI database.');
} finally {
  await closeDatabase();
}
