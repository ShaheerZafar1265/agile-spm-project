const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Resolve the API origin shared by Next rewrites and the health proxy. */
export function apiOrigin(env = process.env) {
  const configured = env.API_URL?.trim();
  const production = env.VERCEL_ENV === 'production'
    || (env.NODE_ENV === 'production' && env.VERCEL_ENV !== 'preview');

  if (!configured) {
    if (production) throw new Error('API_URL must be set to the production API origin.');
    return 'http://localhost:4000';
  }

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('API_URL must be a valid absolute HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_URL must be a valid absolute HTTP(S) origin without credentials, path, query, or fragment.');
  }
  if (production && (url.protocol !== 'https:' || isLocalHost(url.hostname))) {
    throw new Error('API_URL must use HTTPS and a non-localhost host in production.');
  }
  return url.origin;
}
