/**
 * Bind the super admin role (lib/hierarchy.js) to one account in the in-memory
 * store. scripts/superadmin.js runs this on a database (data/superadmin.js);
 * the API itself never assigns the role.
 */
import { users, findUserByEmail, createUser, sanitizeUser } from '../data/store.js';
import { email as readEmail, personName } from './validate.js';
import { passwordError } from './password-policy.js';

/**
 * Make the account with `email` the super admin. An existing account is
 * promoted, keeps its password and is reactivated if suspended; with no
 * account, one is created from `name` and `password`. Every other super admin
 * becomes an admin, so exactly one account holds the role. Input is checked
 * before anything changes; an invalid email, name or password throws.
 *
 * Returns { user (sanitized), created, demoted (emails of former holders) }.
 */
export function bindSuperadmin({ email, name, password } = {}) {
  const address = readEmail(email);
  const existing = findUserByEmail(address);
  let fullName;
  if (!existing) {
    fullName = personName(name);
    if (typeof password !== 'string' || !password) throw new Error('A password is required to create the super admin account.');
    const weak = passwordError(password, { email: address, name: fullName });
    if (weak) throw new Error(weak);
  }

  const demoted = users.filter((u) => u.role === 'superadmin' && u !== existing);
  for (const u of demoted) u.role = 'admin';

  const user = existing ?? createUser({ name: fullName, email: address, password, role: 'superadmin' });
  user.role = 'superadmin';
  user.active = true;
  return { user: sanitizeUser(user), created: !existing, demoted: demoted.map((u) => u.email) };
}
