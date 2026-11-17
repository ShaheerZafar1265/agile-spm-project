const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Fail fast on deployment configuration without including any secret values. */
export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const secret = env.JWT_SECRET?.trim();
  if (!secret || secret === 'dev-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be configured for production.');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for production.');
  }

  const configured = env.DATABASE_URL?.trim();
  if (!configured) throw new Error('DATABASE_URL must be configured for production.');

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (isLocalHost(url.hostname)) {
    throw new Error('DATABASE_URL must not point to localhost in production.');
  }
}
