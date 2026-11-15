/** Binding the super admin role — lib/superadmin.js (scripts/superadmin.js runs it on a database). */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { users, findUserByEmail } from '../../src/data/store.js';
import { snapshot, restore } from '../../src/data/snapshot.js';

const { bindSuperadmin } = await import('../../src/lib/superadmin.js').catch(() => ({}));

const seed = snapshot();
beforeEach(() => restore(seed));

const holders = () => users.filter((u) => u.role === 'superadmin').map((u) => u.email);

test('binding an existing admin promotes it, keeps its password and demotes the previous super admin', () => {
  // Arrange
  const before = findUserByEmail('shahanarain33@gmail.com').passwordHash;

  // Act
  const result = bindSuperadmin({ email: 'Shahanarain33@gmail.com ' });

  // Assert
  assert.equal(result.created, false);
  assert.equal(result.user.role, 'superadmin');
  assert.deepEqual(result.demoted, ['sabihuddin106@gmail.com']);
  assert.deepEqual(holders(), ['shahanarain33@gmail.com']);
  assert.equal(findUserByEmail('sabihuddin106@gmail.com').role, 'admin');
  assert.equal(findUserByEmail('shahanarain33@gmail.com').passwordHash, before);
});

test('binding the current super admin again changes nothing', () => {
  // Act
  const result = bindSuperadmin({ email: 'sabihuddin106@gmail.com' });

  // Assert
  assert.equal(result.created, false);
  assert.deepEqual(result.demoted, []);
  assert.deepEqual(holders(), ['sabihuddin106@gmail.com']);
});

test('binding a suspended account reactivates it', () => {
  // Arrange
  findUserByEmail('manager@rest.test').active = false;

  // Act
  const result = bindSuperadmin({ email: 'manager@rest.test' });

  // Assert
  assert.equal(result.user.active, true);
  assert.deepEqual(holders(), ['manager@rest.test']);
});

test('with no account for the email, it creates an active super admin with that password', () => {
  // Arrange
  const count = users.length;

  // Act
  const result = bindSuperadmin({ email: 'owner@example.com', name: 'Olive Owner', password: 'Ledger-Kite-42!' });

  // Assert
  const created = findUserByEmail('owner@example.com');
  assert.equal(result.created, true);
  assert.equal(users.length, count + 1);
  assert.equal(created.role, 'superadmin');
  assert.equal(created.active, true);
  assert.equal(created.mustChangePassword, false);
  assert.ok(bcrypt.compareSync('Ledger-Kite-42!', created.passwordHash));
  assert.ok(!('passwordHash' in result.user), 'the result never carries the hash');
  assert.deepEqual(holders(), ['owner@example.com']);
});

test('creating an account needs a name and a password that meets the policy; nothing changes otherwise', () => {
  // Arrange
  const before = JSON.stringify(snapshot());

  // Act / Assert
  assert.throws(() => bindSuperadmin({ email: 'owner@example.com', name: 'Olive Owner' }), /password/i);
  assert.throws(() => bindSuperadmin({ email: 'owner@example.com', name: 'Olive Owner', password: 'short' }), /Password needs/);
  assert.throws(() => bindSuperadmin({ email: 'owner@example.com', password: 'Ledger-Kite-42!' }), /name/i);
  assert.throws(() => bindSuperadmin({ email: 'not-an-email', name: 'Olive Owner', password: 'Ledger-Kite-42!' }), /email/i);
  assert.equal(JSON.stringify(snapshot()), before);
});
