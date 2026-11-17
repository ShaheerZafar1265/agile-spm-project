import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../../src/lib/production-config.js';

const secret = 'a'.repeat(48);
const valid = { NODE_ENV: 'production', JWT_SECRET: secret, DATABASE_URL: 'postgres://user:pass@db.example.com/app' };

test('production configuration accepts a strong secret and remote PostgreSQL URL', () => {
  assert.doesNotThrow(() => validateProductionConfig(valid));
});

test('local development does not require production settings', () => {
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'development' }));
});

test('production rejects absent or weak secrets without printing values', () => {
  for (const JWT_SECRET of ['', 'dev-insecure-secret-change-me', 'short']) {
    assert.throws(() => validateProductionConfig({ ...valid, JWT_SECRET }), /JWT_SECRET/);
  }
});

test('production rejects absent, malformed, or localhost database URLs', () => {
  for (const DATABASE_URL of ['', 'not a url', 'postgres://user:pass@localhost/app']) {
    assert.throws(() => validateProductionConfig({ ...valid, DATABASE_URL }), /DATABASE_URL/);
  }
});

test('production errors do not expose configured secrets', () => {
  assert.throws(
    () => validateProductionConfig({ ...valid, JWT_SECRET: 'private-value' }),
    (error) => !error.message.includes('private-value'),
  );
});
