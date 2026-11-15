/**
 * Bind the super admin role to one account on the database in DATABASE_URL
 * (lib/superadmin.js, data/superadmin.js). The API never assigns this role.
 *
 *   node scripts/superadmin.js                            # SUPERADMIN_EMAIL from store.js
 *   node scripts/superadmin.js --email=x@y.com --name="X Y"
 *   node scripts/superadmin.js --url=postgres://...       # explicit connection string
 *   node scripts/superadmin.js --yes-really               # required for a Neon database
 *
 * An existing account keeps its password. For an email with no account, the
 * script asks for a password twice (hidden) before it takes the global lock, so
 * the live site is never held while someone types. Running instances reload
 * the store on their next request.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createPool, isNeonUrl } from '../src/data/db.js';
import { ensureSchema } from '../src/data/relational/schema.js';
import { bindInDatabase } from '../src/data/superadmin.js';
import { SUPERADMIN_EMAIL, findUserByEmail } from '../src/data/store.js';
import { passwordError } from '../src/lib/password-policy.js';
import { email as readEmail } from '../src/lib/validate.js';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const log = (...parts) => console.log('[superadmin]', ...parts);

// Like db:init: find server/.env when started from the repository root.
if (!process.env.DATABASE_URL) {
  const envFile = join(SERVER_ROOT, '.env');
  if (existsSync(envFile)) loadDotenv({ path: envFile });
}

function parseArgs(argv) {
  const opts = { email: SUPERADMIN_EMAIL, name: undefined, url: undefined, yesReally: false };
  for (const arg of argv) {
    if (arg === '--yes-really') opts.yesReally = true;
    else if (arg.startsWith('--email=')) opts.email = arg.slice('--email='.length);
    else if (arg.startsWith('--name=')) opts.name = arg.slice('--name='.length);
    else if (arg.startsWith('--url=')) opts.url = arg.slice('--url='.length);
    else throw new Error(`Unknown argument "${arg}". Use --email=, --name=, --url= and --yes-really.`);
  }
  return opts;
}

/** Read one line from the terminal without echoing what is typed. */
function askHidden(question) {
  if (!process.stdin.isTTY) throw new Error('This email has no account yet: run the script in a terminal to type its password.');
  return new Promise((answer, fail) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let typed = null;
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    rl.question(question, (line) => {
      typed = line;
      rl.close();
    });
    // Enter resolves; Ctrl+D or Ctrl+C closes without an answer.
    rl.on('close', () => {
      process.stdout.write('\n');
      if (typed === null) fail(new Error('No password entered; nothing was changed.'));
      else answer(typed);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = String(opts.url ?? process.env.DATABASE_URL ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!url) throw new Error('No database: set DATABASE_URL in server/.env or pass --url=postgres://...');
  if (isNeonUrl(url) && !opts.yesReally) throw new Error('Refusing to change a Neon database without --yes-really.');
  const email = readEmail(opts.email);

  const pool = createPool(url, { max: 1, connectionTimeoutMillis: 30_000 });
  try {
    await ensureSchema(pool);
    // Before any lock: does the account exist? A database the server never used holds the store seed.
    const used = (await pool.query("SELECT 1 FROM sequences WHERE name = 'state_version'")).rowCount > 0;
    const exists = used
      ? (await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [email])).rowCount > 0
      : Boolean(findUserByEmail(email));
    let password;
    if (!exists) {
      if (!opts.name) throw new Error('This email has no account yet: pass --name="Full Name" to create it.');
      log(`${email} has no account yet, so it will be created as the super admin.`);
      password = await askHidden('Password for the new account: ');
      const weak = passwordError(password, { email, name: opts.name });
      if (weak) throw new Error(weak);
      if ((await askHidden('Type it again: ')) !== password) throw new Error('The passwords do not match.');
    }
    const { user, created, demoted, version } = await bindInDatabase(pool, { email, name: opts.name, password });
    log(`${user.email} is now the super admin (${created ? 'account created' : 'existing account promoted'}).`);
    log(demoted.length ? `Now an admin again: ${demoted.join(', ')}.` : 'No other account held the role.');
    log(`Store version ${version}: running instances reload it on their next request.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[superadmin] ERROR:', err.message);
  process.exitCode = 1;
});
