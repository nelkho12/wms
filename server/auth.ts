import crypto from 'crypto';
import { ROLE_DEFINITIONS, UserRole, WmsPermission } from '../src/types/roles';

// ---------------------------------------------------------------------------
// Passwords (scrypt, per-user random salt)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}

// ---------------------------------------------------------------------------
// Signed session tokens (HMAC-SHA256, no external library)
// ---------------------------------------------------------------------------
export interface TokenPayload {
  uid: string;
  exp: number; // epoch seconds
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function signToken(payload: TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.uid || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Login throttling: 5 wrong passwords -> locked for 1 minute (per account + address)
// ---------------------------------------------------------------------------
const attempts = new Map<string, { count: number; lockedUntil: number }>();

export function throttleCheck(key: string): number {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) return Math.ceil((a.lockedUntil - Date.now()) / 1000);
  return 0;
}
export function throttleFail(key: string) {
  const a = attempts.get(key) || { count: 0, lockedUntil: 0 };
  a.count += 1;
  if (a.count >= 5) {
    a.lockedUntil = Date.now() + 60_000;
    a.count = 0;
  }
  attempts.set(key, a);
}
export function throttleClear(key: string) {
  attempts.delete(key);
}

// ---------------------------------------------------------------------------
// Which permission does each API call need? (enforced on the server)
// ---------------------------------------------------------------------------
export type RolePermissions = Record<UserRole, WmsPermission[]>;

export function defaultRolePermissions(): RolePermissions {
  const out = {} as RolePermissions;
  (Object.keys(ROLE_DEFINITIONS) as UserRole[]).forEach((r) => (out[r] = [...ROLE_DEFINITIONS[r].permissions]));
  return out;
}

type Need = WmsPermission[] | 'any'; // 'any' = any signed-in user; array = needs at least one

interface Rule {
  method: string; // GET, POST, ... or '*'
  path: RegExp;
  need: Need;
}

const RULES: Rule[] = [
  { method: 'GET', path: /^\/api\/mssql\//, need: ['mssql:console'] },
  { method: '*', path: /^\/api\/mssql\//, need: ['mssql:console'] },
  { method: 'GET', path: /^\/api\//, need: 'any' },

  { method: 'POST', path: /^\/api\/auth\/(logout|change-password)$/, need: 'any' },
  { method: 'POST', path: /^\/api\/audit-logs$/, need: 'any' },
  { method: 'POST', path: /^\/api\/gemini\//, need: 'any' },

  { method: 'POST', path: /^\/api\/inventory\/receive$/, need: ['inbound:receive', 'inventory:write'] },
  { method: 'POST', path: /^\/api\/inventory\/quarantine$/, need: ['quarantine:manage'] },
  { method: 'POST', path: /^\/api\/inventory\/outbound$/, need: ['inventory:write', 'orders:pick'] },
  { method: 'POST', path: /^\/api\/inventory\//, need: ['inventory:write'] },

  { method: '*', path: /^\/api\/(skus|categories|locations|facilities|zones|purchase-orders|matrix)(\/|$)/, need: ['inventory:write'] },
  { method: 'DELETE', path: /^\/api\/stock-movements$/, need: ['settings:manage'] },

  { method: '*', path: /^\/api\/(sales-orders|customers)(\/|$)/, need: ['orders:manage'] },
  { method: 'POST', path: /^\/api\/orders\/(optimize-route|complete-pick)$/, need: ['orders:pick'] },

  // Anyone may edit their own profile; the handler refuses role/password/other-person changes unless Admin.
  { method: 'PUT', path: /^\/api\/users\/[^/]+$/, need: 'any' },
  { method: '*', path: /^\/api\/(users|role-permissions|settings)(\/|$)/, need: ['settings:manage'] }
];

export function requiredPermissions(method: string, path: string): Need {
  for (const r of RULES) {
    if ((r.method === '*' || r.method === method) && r.path.test(path)) return r.need;
  }
  // Anything not listed that changes data needs the highest setting.
  return method === 'GET' ? 'any' : ['settings:manage'];
}

export function isAllowed(role: UserRole, need: Need, perms: RolePermissions): boolean {
  if (need === 'any') return true;
  const granted = perms[role] || [];
  return need.some((p) => granted.includes(p));
}
