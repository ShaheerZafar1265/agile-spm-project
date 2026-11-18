/**
 * Schema bootstrap — data/relational/schema.js applies the schema files to a
 * real Postgres database (needs DATABASE_URL, see `npm run test:db`).
 */
import 'dotenv/config';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/data/db.js';
import { requireTestDatabase } from './guard.js';
import { ensureSchema } from '../src/data/relational/schema.js';

requireTestDatabase();
const pool = createPool(process.env.DATABASE_URL);
after(() => pool.end());

test('ensureSchema creates all 29 tables and the store-only columns, idempotently', async () => {
  // Arrange
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  // Act
  await ensureSchema(pool);
  await ensureSchema(pool);

  // Assert
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  assert.equal(rows[0].n, 29);
  const col = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_lines' AND column_name = 'supplier'",
  );
  assert.equal(col.rowCount, 1);
});

test('the role enum has the super admin, and the database allows at most one super admin', async () => {
  // Arrange
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ensureSchema(pool);
  const insertSuperadmin = (ext, email) => pool.query(
    "INSERT INTO users (ext_id, name, email, role, password_hash) VALUES ($1, 'Someone', $2, 'superadmin', 'x')",
    [ext, email],
  );

  // Act
  const { rows } = await pool.query('SELECT unnest(enum_range(NULL::role))::text AS role');
  await insertSuperadmin('usr_one', 'one@example.com');
  const second = await insertSuperadmin('usr_two', 'two@example.com').catch((err) => err);

  // Assert
  assert.ok(rows.some((r) => r.role === 'superadmin'));
  assert.equal(second.code, '23505', 'a second super admin is a unique violation');
  assert.equal(second.constraint, 'uq_users_one_superadmin');
});

test('db:init applies every schema file before the seed, so the seeded super admin loads', async () => {
  // Arrange
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const serverRoot = fileURLToPath(new URL('../', import.meta.url));

  // Act
  const run = spawnSync(process.execPath, ['scripts/initdb_localpg.js', `--url=${process.env.DATABASE_URL}`], {
    cwd: serverRoot, env: process.env, encoding: 'utf8',
  });
  const { rows } = await pool.query("SELECT email, role::text AS role FROM users WHERE role = 'superadmin'");

  // Assert
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(rows, [{ email: 'sabihuddin106@gmail.com', role: 'superadmin' }]);
});

test('db:init accepts the -- that `pnpm run db:init -- …` forwards', async () => {
  // Arrange
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const serverRoot = fileURLToPath(new URL('../', import.meta.url));

  // Act
  const run = spawnSync(process.execPath, ['scripts/initdb_localpg.js', '--', `--url=${process.env.DATABASE_URL}`], {
    cwd: serverRoot, env: process.env, encoding: 'utf8',
  });

  // Assert
  assert.equal(run.status, 0, run.stderr);
});

