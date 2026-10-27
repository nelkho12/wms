/**
 * All calls to the ApexWMS service go through apiFetch():
 *  - it adds the server address (needed in the desktop app, which has no web server of its own)
 *  - it adds the signed-in user's token
 *  - when the server says "please sign in" it tells the app so the login screen appears
 */

const URL_KEY = 'wms_server_url';
const TOKEN_KEY = 'wms_token';

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function safeSet(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: keep working for this session only */
  }
}

/** The desktop app is opened from a file, so it must be told where the service is. */
export const needsServerAddress = (): boolean => typeof location !== 'undefined' && location.protocol === 'file:';

export function normalizeServerUrl(input: string): string {
  let u = (input || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

export const getServerUrl = (): string => safeGet(URL_KEY);
export const setServerUrl = (url: string) => safeSet(URL_KEY, normalizeServerUrl(url));
export const getToken = (): string => safeGet(TOKEN_KEY);
export const setToken = (token: string) => safeSet(TOKEN_KEY, token);

export const AUTH_EXPIRED_EVENT = 'wms-auth-expired';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getServerUrl();
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (res.status === 401 && token && !path.startsWith('/api/auth/login')) {
    setToken('');
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  return res;
}
