import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import compression from 'compression';
import { GoogleGenAI } from '@google/genai';
import {
  INITIAL_SKUS,
  INITIAL_LOCATIONS,
  INITIAL_BATCHES,
  INITIAL_ORDERS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_MSSQL_SCHEMA,
  INITIAL_CUSTOMERS,
  INITIAL_FACILITIES,
  INITIAL_ZONES
} from './src/data/initialData';
import { INITIAL_USERS, UserProfile, UserRole, WmsPermission } from './src/types/roles';
import { calculateOptimizedPickRoute } from './src/utils/routeOptimizer';
import { Batch, PickOrder, StockMovement, ProductSKU, Location, AuditLogEntry, PurchaseOrder, CustomerProfile, WarehouseFacility, StorageZone } from './src/types/wms';
import { Persistence, MemoryStore, SqlServerStore, sqlConfigFromEnv, Store } from './server/store';
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  signToken,
  verifyToken,
  throttleCheck,
  throttleFail,
  throttleClear,
  requiredPermissions,
  isAllowed,
  defaultRolePermissions,
  RolePermissions
} from './server/auth';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TOKEN_HOURS = Number(process.env.SESSION_HOURS || 12);

/** A user as stored in the database (includes the password hash, which is never sent to clients). */
type StoredUser = UserProfile & { passwordHash?: string; disabled?: boolean };

// In-memory working copy of the database. Every change is written to the database
// before the response is sent (see the request pipeline below).
let skusState: ProductSKU[] = [];
let locationsState: Location[] = [];
let batchesState: Batch[] = [];
let ordersState: PickOrder[] = [];
let stockMovementsState: StockMovement[] = [];
let auditLogsState: AuditLogEntry[] = [];
let purchaseOrdersState: PurchaseOrder[] = [];
let usersState: StoredUser[] = [];
let customersState: CustomerProfile[] = [];
let facilitiesState: WarehouseFacility[] = [];
let zonesState: StorageZone[] = [];
let deletedCategoriesState: string[] = [];
let rolePermsState: RolePermissions = defaultRolePermissions();
// Admin tick: when true, stock-out actions may take a batch below zero (default: refused).
let allowNegativeStock = false;
let authSecret = '';
let mssqlSimulateOffline = false;

let store: Store;
let persistence: Persistence;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Local server time as 'YYYY-MM-DD HH:mm:ss' (the PC's own timezone, e.g. Malaysia). */
function nowStamp(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let uidCounter = 0;
/** Short unique id fragment that cannot repeat (time + counter + random). */
function uid(): string {
  uidCounter = (uidCounter + 1) % 1296;
  return (
    Date.now().toString(36).toUpperCase() +
    uidCounter.toString(36).toUpperCase().padStart(2, '0') +
    crypto.randomBytes(2).toString('hex').toUpperCase()
  );
}

/** Readable numeric id like ORD-48213 that is guaranteed not to exist yet. */
function numId<T extends { id: string }>(prefix: string, existing: T[], key: (row: T) => string | undefined = (r) => r.id): string {
  const taken = new Set(existing.map((r) => key(r)));
  for (let i = 0; i < 50; i++) {
    const candidate = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${uid()}`;
}

const isValidDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(new Date(v).getTime());
const todayStr = () => nowStamp().slice(0, 10);
/** True when the best-before date is before today (expired stock is never shipped). */
const isExpired = (bbd: string) => isValidDate(bbd) && bbd.slice(0, 10) < todayStr();

function publicUser(u: StoredUser): UserProfile {
  const { passwordHash, disabled, ...rest } = u as any;
  return rest as UserProfile;
}


// --- stock helpers -----------------------------------------------------------
const itemRequested = (i: any): number => Number(i.orderQtyCtn ?? i.requestedQty ?? 0);
const itemFulfilled = (i: any): number => Number(i.fulfillmentQty ?? i.pickedQty ?? 0);
const isPositive = (v: any): boolean => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) && Number(v) > 0;

/** Batches that may be shipped, earliest best-before first (FEFO). Never quarantined, recalled or expired. */
function fefoBatches(sku: string): Batch[] {
  return batchesState
    .filter((b) => b.sku === sku && b.status === 'ACTIVE' && b.quantityOnHand > 0 && !isExpired(b.bestBeforeDate))
    .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime());
}

function recalcOrderTotals(order: PickOrder) {
  let ordered = 0;
  let allocated = 0;
  let fulfilled = 0;
  order.items.forEach((item) => {
    ordered += itemRequested(item);
    allocated += Number(item.allocateQty ?? 0);
    fulfilled += itemFulfilled(item);
  });
  order.totalOrderCtn = ordered;
  order.totalAllocatedCtn = allocated;
  order.totalFulfilledCtn = fulfilled;
  order.totalOutstandingCtn = Math.max(0, ordered - fulfilled);
}

/** Stock reserved for OTHER open orders for this SKU (not yet picked). */
function reservedByOthers(sku: string, exceptOrderId: string): number {
  let total = 0;
  ordersState.forEach((o) => {
    if (o.id === exceptOrderId) return;
    if (o.status === 'CANCELLED' || o.status === 'COMPLETED' || o.status === 'DONE') return;
    o.items.forEach((i) => {
      if (i.sku !== sku) return;
      total += Math.max(0, Number(i.allocateQty ?? i.requestedQty ?? 0) - itemFulfilled(i));
    });
  });
  return total;
}

/** Shippable stock for a SKU that is not already reserved for other open orders. */
function freeStockFor(sku: string, exceptOrderId: string): number {
  const onHand = fefoBatches(sku).reduce((sum, b) => sum + b.quantityOnHand, 0);
  return Math.max(0, onHand - reservedByOthers(sku, exceptOrderId));
}

function newMovement(m: Omit<StockMovement, 'id' | 'timestamp'>): StockMovement {
  return { id: `LOG-${uid()}`, timestamp: nowStamp(), ...m };
}

function stateForPersistence() {
  return {
    skus: skusState,
    locations: locationsState,
    batches: batchesState,
    orders: ordersState,
    stockMovements: stockMovementsState,
    auditLogs: auditLogsState,
    purchaseOrders: purchaseOrdersState,
    users: usersState,
    customers: customersState,
    facilities: facilitiesState,
    zones: zonesState
  };
}

function currentMeta(): Record<string, string> {
  return {
    deletedCategories: JSON.stringify(deletedCategoriesState),
    rolePermissions: JSON.stringify(rolePermsState),
    allowNegativeStock: JSON.stringify(allowNegativeStock)
  };
}

function applyLoaded(s: any) {
  skusState = s.skus;
  locationsState = s.locations;
  batchesState = s.batches;
  ordersState = s.orders;
  stockMovementsState = s.stockMovements;
  auditLogsState = s.auditLogs;
  purchaseOrdersState = s.purchaseOrders;
  usersState = s.users;
  customersState = s.customers;
  facilitiesState = s.facilities;
  zonesState = s.zones;
}

async function reloadFromDb() {
  const loaded = await persistence.loadAll();
  applyLoaded(loaded);
  const dc = await persistence.getMeta('deletedCategories');
  deletedCategoriesState = dc ? JSON.parse(dc) : [];
  const rp = await persistence.getMeta('rolePermissions');
  rolePermsState = rp ? { ...defaultRolePermissions(), ...JSON.parse(rp) } : defaultRolePermissions();
  const an = await persistence.getMeta('allowNegativeStock');
  allowNegativeStock = an ? JSON.parse(an) === true : false;
  if (dc) persistence.setSavedMeta('deletedCategories', dc);
  if (rp) persistence.setSavedMeta('rolePermissions', rp);
  if (an) persistence.setSavedMeta('allowNegativeStock', an);
}

// ---------------------------------------------------------------------------
// Start-up: connect to the database, load data, first-run seeding
// ---------------------------------------------------------------------------
async function initialize() {
  const kind = (process.env.WMS_STORE || 'mssql').toLowerCase();
  if (kind === 'memory') {
    console.warn('[WMS] Using the in-memory store (data is lost on restart). For testing only.');
    store = new MemoryStore();
  } else {
    const cfg = sqlConfigFromEnv(process.env);
    if (!cfg.user || !cfg.password) {
      throw new Error('MSSQL_USER and MSSQL_PASSWORD must be set in the .env file.');
    }
    console.log(`[WMS] Connecting to SQL Server ${cfg.server}${cfg.instanceName ? '\\' + cfg.instanceName : ':' + cfg.port}, database ${cfg.database} ...`);
    store = new SqlServerStore(cfg);
  }
  await store.init();
  persistence = new Persistence(store);
  await reloadFromDb();

  // Secret used to sign login tokens: from .env, otherwise generated once and kept in the database.
  authSecret = process.env.AUTH_SECRET || (await persistence.getMeta('authSecret')) || '';
  const meta: Record<string, string> = {};
  if (!authSecret) {
    authSecret = crypto.randomBytes(48).toString('base64url');
    meta.authSecret = authSecret;
  }

  // First run: load starter data once.
  const seeded = await persistence.getMeta('seeded');
  if (!seeded) {
    const mode = (process.env.SEED_MODE || 'master').toLowerCase(); // master | demo | none
    if (mode !== 'none') {
      if (skusState.length === 0) skusState = INITIAL_SKUS.map((x) => ({ ...x }));
      if (locationsState.length === 0) locationsState = INITIAL_LOCATIONS.map((x) => ({ ...x }));
      if (zonesState.length === 0) zonesState = INITIAL_ZONES.map((x) => ({ ...x }));
      if (facilitiesState.length === 0) facilitiesState = INITIAL_FACILITIES.map((x) => ({ ...x }));
      if (customersState.length === 0) customersState = INITIAL_CUSTOMERS.map((x) => ({ ...x }));
      if (mode === 'demo') {
        batchesState = batchesState.length ? batchesState : INITIAL_BATCHES.map((x) => ({ ...x }));
        ordersState = ordersState.length ? ordersState : JSON.parse(JSON.stringify(INITIAL_ORDERS));
        stockMovementsState = stockMovementsState.length ? stockMovementsState : INITIAL_STOCK_MOVEMENTS.map((x) => ({ ...x }));
        auditLogsState = auditLogsState.length ? auditLogsState : INITIAL_AUDIT_LOGS.map((x) => ({ ...x }));
        purchaseOrdersState = purchaseOrdersState.length ? purchaseOrdersState : INITIAL_PURCHASE_ORDERS.map((x) => ({ ...x }));
        const demoPw = process.env.DEMO_USER_PASSWORD || 'Demo12345!';
        INITIAL_USERS.forEach((u) => {
          if (!usersState.some((x) => x.id === u.id)) usersState.push({ ...u, passwordHash: hashPassword(demoPw) });
        });
        console.log(`[WMS] Demo data loaded. Demo users (${INITIAL_USERS.map((u) => u.email).join(', ')}) have password: ${demoPw}`);
      }
    }
    meta.seeded = (process.env.SEED_MODE || 'master').toLowerCase();
  }

  // First run: create the administrator account.
  if (!usersState.some((u) => u.role === 'Admin' && !u.disabled)) {
    const email = (process.env.ADMIN_EMAIL || 'admin@mayralab.local').trim();
    let pw = process.env.ADMIN_PASSWORD || '';
    let generated = false;
    if (!pw) {
      pw = crypto.randomBytes(9).toString('base64url');
      generated = true;
    }
    usersState.push({
      id: 'USR-ADMIN',
      name: 'Administrator',
      email,
      role: 'Admin',
      department: 'Management',
      shift: 'Any',
      badgeCode: 'BDG-ADMIN',
      passwordHash: hashPassword(pw)
    });
    console.log('================================================================');
    console.log(' First run: administrator account created');
    console.log(`   Login:    ${email}`);
    console.log(`   Password: ${generated ? pw + '   (generated - note it down and change it after login)' : '(from ADMIN_PASSWORD in .env)'}`);
    console.log('================================================================');
  }

  await persistence.commit(stateForPersistence() as any, { ...currentMeta(), ...meta });
  for (const [k, v] of Object.entries(meta)) persistence.setSavedMeta(k, v);
}

// ---------------------------------------------------------------------------
// Request pipeline:  CORS -> sign-in check -> one-at-a-time lock -> handler
//                    -> write changes to the database -> send the response
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  // The desktop app is served from file:// and signs in with a bearer token (no cookies),
  // so any origin may call the API; the token is what protects it.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(compression());
app.use(express.json({ limit: '10mb' }));

let lockTail: Promise<void> = Promise.resolve();
function acquireLock(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const prev = lockTail;
  lockTail = lockTail.then(() => mine);
  return prev.then(() => release);
}

const PUBLIC_API = new Set(['GET /api/health', 'POST /api/auth/login']);

app.use('/api', async (req, res, next) => {
  const full = `${req.method} /api${req.path}`.replace(/\/$/, '');
  const isPublic = PUBLIC_API.has(full);

  if (!isPublic) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = token ? verifyToken(token, authSecret) : null;
    const user = payload ? usersState.find((u) => u.id === payload.uid && !u.disabled) : undefined;
    if (!user) {
      return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    }
    const need = requiredPermissions(req.method, `/api${req.path}`.replace(/\/$/, ''));
    if (!isAllowed(user.role, need, rolePermsState)) {
      return res.status(403).json({ error: `Your role (${user.role}) is not allowed to do this.` });
    }
    (req as any).user = user;
  }

  if (full === 'GET /api/health') return next();

  // Everything else runs one request at a time, so two computers can never change
  // the same stock at the same moment.
  const release = await acquireLock();
  let released = false;
  const done = () => {
    if (!released) {
      released = true;
      release();
    }
  };
  res.on('close', done);

  const firstAuditBefore = auditLogsState[0]?.id;
  const origJson = res.json.bind(res);
  let sent = false;
  (res as any).json = (body: any) => {
    if (sent) return res;
    sent = true;
    (async () => {
      try {
        if (res.statusCode >= 400 && !res.locals.keepChanges) {
          // The request failed: throw away any half-finished changes.
          const dirtyState = await persistenceIsDirty();
          if (dirtyState) await reloadFromDb();
        } else {
          // Tag new audit entries with the signed-in user and their network address.
          const u = (req as any).user as StoredUser | undefined;
          for (const a of auditLogsState) {
            if (a.id === firstAuditBefore) break;
            if (u) {
              a.userId = u.id;
              a.userName = u.name;
              a.userRole = u.role;
            }
            a.ipAddress = String(req.ip || '').replace('::ffff:', '');
          }
          await persistence.commit(stateForPersistence() as any, currentMeta());
        }
        origJson(body);
      } catch (err: any) {
        console.error('[WMS] Database write failed:', err?.message || err);
        try {
          await reloadFromDb();
        } catch (e: any) {
          console.error('[WMS] Reload after failure also failed:', e?.message || e);
        }
        res.status(503);
        origJson({ error: 'The database could not save this change. Nothing was changed. Please try again.' });
      } finally {
        done();
      }
    })();
    return res;
  };
  next();
});

async function persistenceIsDirty(): Promise<boolean> {
  try {
    return await persistence.hasChanges(stateForPersistence() as any, currentMeta());
  } catch {
    return true;
  }
}

// Lazy Gemini AI Client initialization
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// ==========================================
// SIGN-IN & PERMISSIONS
// ==========================================

// POST /api/auth/login - sign in with e-mail (or badge code) + password
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const ident = String(email || '').trim().toLowerCase();
  if (!ident || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your e-mail and password.' });
  }

  const throttleKey = `${ident}|${req.ip}`;
  const wait = throttleCheck(throttleKey);
  if (wait > 0) {
    return res.status(429).json({ error: `Too many wrong passwords. Try again in ${wait} seconds.` });
  }

  const user = usersState.find((u) => !u.disabled && (u.email.toLowerCase() === ident || (u.badgeCode || '').toLowerCase() === ident));
  // Always run the hash check so timing does not reveal whether the account exists.
  const ok = verifyPassword(password, user?.passwordHash ?? hashPassword('x'));
  if (!user || !ok) {
    throttleFail(throttleKey);
    auditLogsState.unshift({
      id: `AUD-${uid()}`,
      timestamp: nowStamp(),
      userId: user?.id || 'UNKNOWN',
      userName: user?.name || ident,
      userRole: user?.role || 'Picker',
      actionCategory: 'SYSTEM',
      actionType: 'LOGIN_FAILED',
      targetEntity: ident,
      details: `Failed sign-in attempt for '${ident}'.`,
      severity: 'WARNING',
      ipAddress: String(req.ip || '').replace('::ffff:', '')
    });
    res.locals.keepChanges = true; // still record the failed attempt in the audit log
    return res.status(401).json({ error: 'Wrong e-mail or password.' });
  }

  throttleClear(throttleKey);
  const token = signToken({ uid: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600 }, authSecret);
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    actionCategory: 'SYSTEM',
    actionType: 'USER_LOGIN',
    targetEntity: `User ${user.name}`,
    details: `${user.name} (${user.role}) signed in.`,
    severity: 'INFO',
    ipAddress: String(req.ip || '').replace('::ffff:', '')
  });
  res.json({ token, user: publicUser(user), rolePermissions: rolePermsState });
});

// GET /api/auth/me - who am I (also used to check a saved token is still valid)
app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUser((req as any).user), rolePermissions: rolePermsState });
});

// POST /api/auth/change-password - change my own password
app.post('/api/auth/change-password', (req, res) => {
  const me = (req as any).user as StoredUser;
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(String(currentPassword || ''), me.passwordHash)) {
    return res.status(400).json({ error: 'Current password is wrong.' });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  me.passwordHash = hashPassword(newPassword);
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: me.id,
    userName: me.name,
    userRole: me.role,
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'PASSWORD_CHANGED',
    targetEntity: me.name,
    details: `${me.name} changed their own password.`,
    severity: 'INFO'
  });
  res.json({ success: true });
});

// GET/PUT /api/settings - warehouse-wide switches (only an Admin may change them)
app.get('/api/settings', (req, res) => {
  res.json({ allowNegativeStock });
});
app.put('/api/settings', (req, res) => {
  const me = (req as any).user as StoredUser;
  if (me.role !== 'Admin') {
    return res.status(403).json({ error: 'Only an Admin can change warehouse settings.' });
  }
  const { allowNegativeStock: next } = req.body || {};
  if (typeof next !== 'boolean') {
    return res.status(400).json({ error: 'allowNegativeStock must be true or false.' });
  }
  if (next !== allowNegativeStock) {
    allowNegativeStock = next;
    auditLogsState.unshift({
      id: `AUD-${uid()}`,
      timestamp: nowStamp(),
      userId: me.id,
      userName: me.name,
      userRole: me.role,
      actionCategory: 'SYSTEM',
      actionType: 'NEGATIVE_STOCK_SETTING',
      targetEntity: 'Warehouse settings',
      details: next
        ? 'Negative stock ALLOWED: stock-outs may now take a batch below zero.'
        : 'Negative stock NOT allowed: stock-outs are refused when a batch has too little stock.',
      severity: next ? 'WARNING' : 'INFO',
      ipAddress: String(req.ip || '').replace('::ffff:', '')
    } as AuditLogEntry);
  }
  res.json({ allowNegativeStock });
});

// GET/PUT /api/role-permissions - which role may do what (shared by all computers)
app.get('/api/role-permissions', (req, res) => {
  res.json(rolePermsState);
});
app.put('/api/role-permissions', (req, res) => {
  const incoming = req.body as RolePermissions;
  const valid: WmsPermission[] = [
    'inventory:read', 'inventory:write', 'inbound:receive', 'traceability:view', 'quarantine:manage',
    'orders:view', 'orders:pick', 'orders:manage', 'mssql:console', 'settings:manage'
  ];
  const roles: UserRole[] = ['Admin', 'Warehouse Manager', 'Picker', 'Receiver'];
  const next = {} as RolePermissions;
  for (const r of roles) {
    const list = incoming?.[r];
    if (!Array.isArray(list) || list.some((p) => !valid.includes(p))) {
      return res.status(400).json({ error: `Invalid permission list for role ${r}.` });
    }
    next[r] = [...new Set(list)];
  }
  // The Admin role can never lock itself out of user/permission management.
  for (const must of ['settings:manage', 'inventory:read'] as WmsPermission[]) {
    if (!next.Admin.includes(must)) next.Admin.push(must);
  }
  rolePermsState = next;
  res.json(rolePermsState);
});

// ==========================================
// API ROUTES
// ==========================================

// GET /api/health  (no sign-in needed; used by the desktop app to test the server address)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'ApexWMS Service',
    timestamp: new Date().toISOString()
  });
});

// GET /api/customers - List all customer profiles
app.get('/api/customers', (req, res) => {
  res.json(customersState);
});

// POST /api/customers - Create new customer profile
app.post('/api/customers', (req, res) => {
  const { companyName, contactPerson, email, phone, address, customerCode, creditLimit, paymentTerms, preferredZone, notes } = req.body;

  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: 'Company Name is required.' });
  }

  const id = numId('CUST', customersState);
  const code = customerCode || `CUST-${companyName.slice(0, 3).toUpperCase()}`;

  const newCustomer: CustomerProfile = {
    id,
    customerCode: code,
    companyName: companyName.trim(),
    contactPerson: contactPerson || 'Purchasing Manager',
    email: email || '',
    phone: phone || '',
    address: address || '',
    creditLimit: Number(creditLimit || 100000),
    paymentTerms: paymentTerms || 'NET 30',
    preferredZone: preferredZone || 'Outbound Express Bay 1',
    status: 'ACTIVE',
    notes: notes || ''
  };

  customersState.unshift(newCustomer);

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_CREATED',
    targetEntity: code,
    details: `Created new customer profile: ${companyName} (${code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, customer: newCustomer, customers: customersState });
});

// PUT /api/customers/:id - Update customer profile
app.put('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = customersState.findIndex((c) => c.id === decodedId || c.customerCode === decodedId || c.id === id || c.customerCode === id);

  if (index === -1) {
    return res.status(404).json({ error: `Customer '${decodedId}' not found.` });
  }

  customersState[index] = {
    ...customersState[index],
    ...req.body
  };

  auditLogsState.unshift({
    id: `LOG-${uid()}`,
    timestamp: nowStamp(),
    userId: 'USR-101',
    userName: 'Operations Lead',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_UPDATED',
    targetEntity: customersState[index].customerCode,
    details: `Updated customer profile: ${customersState[index].companyName} (${customersState[index].customerCode}).`,
    severity: 'INFO'
  });

  res.json({ success: true, customer: customersState[index], customers: customersState });
});

// DELETE /api/customers/:id - Delete customer profile
app.delete('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = customersState.findIndex((c) => c.id === decodedId || c.customerCode === decodedId || c.id === id || c.customerCode === id);

  if (index === -1) {
    return res.status(404).json({ error: `Customer '${decodedId}' not found.` });
  }

  const removed = customersState.splice(index, 1)[0];

  auditLogsState.unshift({
    id: `LOG-${uid()}`,
    timestamp: nowStamp(),
    userId: 'USR-101',
    userName: 'Operations Lead',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_DELETED',
    targetEntity: removed.customerCode,
    details: `Deleted customer profile: ${removed.companyName} (${removed.customerCode}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: removed.id, customers: customersState });
});

// GET /api/inventory - Full inventory state
app.get('/api/inventory', (req, res) => {
  // Sync SKUs & Catcher Gourmet Internal Sheet Balance Matrix state with live database batches and stock movements
  syncInventoryAndMatrixState();

  // Enrich batches with location details & expiry status
  const now = new Date().getTime();
  const enrichedBatches = batchesState.map((batch) => {
    const bbdTime = new Date(batch.bestBeforeDate).getTime();
    const daysUntilExpiry = Math.ceil((bbdTime - now) / (1000 * 3600 * 24));

    let expiryAlert: 'HEALTHY' | 'EXPIRING_SOON' | 'CRITICAL' | 'EXPIRED' = 'HEALTHY';
    if (daysUntilExpiry < 0) {
      expiryAlert = 'EXPIRED';
    } else if (daysUntilExpiry <= 14) {
      expiryAlert = 'CRITICAL';
    } else if (daysUntilExpiry <= 30) {
      expiryAlert = 'EXPIRING_SOON';
    }

    const loc = locationsState.find((l) => l.id === batch.locationId);

    return {
      ...batch,
      daysUntilExpiry,
      expiryAlert,
      locationDetails: loc
    };
  });

  res.json({
    skus: skusState,
    locations: locationsState,
    batches: enrichedBatches,
    stockMovements: stockMovementsState,
    facilities: facilitiesState,
    zones: zonesState
  });
});

// POST /api/inventory/receive - Inbound stock receiving with Batch No & Best Before Date
app.post('/api/inventory/receive', (req, res) => {
  const { sku, batchNo, manufactureDate, bestBeforeDate, supplier, locationId, quantity, unitCost, category } = req.body;

  if (!sku || !batchNo || !bestBeforeDate || !locationId || quantity === undefined || quantity === null || quantity === '') {
    return res.status(400).json({ error: 'Missing required fields: sku, batchNo, bestBeforeDate, locationId, quantity' });
  }
  if (!isPositive(quantity)) {
    return res.status(400).json({ error: 'Quantity must be a number greater than 0.' });
  }
  if (!isValidDate(bestBeforeDate)) {
    return res.status(400).json({ error: 'Best-before date is not a valid date (use YYYY-MM-DD).' });
  }
  if (manufactureDate && !isValidDate(manufactureDate)) {
    return res.status(400).json({ error: 'Manufacture date is not a valid date (use YYYY-MM-DD).' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found.` });
  }

  if (category) {
    skuObj.category = category;
  }

  const qty = Number(quantity);
  const newLotId = `LOT-${uid()}`;
  const timestampStr = nowStamp();

  const newBatch: Batch = {
    id: newLotId,
    batchNo: String(batchNo).trim(),
    sku,
    category: category || skuObj.category,
    itemName: skuObj.name,
    manufactureDate: manufactureDate || todayStr(),
    bestBeforeDate,
    supplier: supplier || 'Standard Supplier',
    locationId,
    quantityOnHand: qty,
    quantityAllocated: 0,
    quantityAvailable: qty,
    unitCost: Number(unitCost || 5.0),
    status: 'ACTIVE',
    receivedAt: timestampStr,
    notes: 'Inbound received via Floor Mobile App'
  };

  batchesState.unshift(newBatch);

  const newLog = newMovement({
    type: 'INBOUND_RECEIVE',
    sku,
    itemName: skuObj.name,
    batchNo: newBatch.batchNo,
    toLocation: locationId,
    quantity: qty,
    operator: (req as any).user?.name || 'Floor Op (Mobile Scanner)',
    referenceDoc: `PO-INBOUND-${Math.floor(1000 + Math.random() * 9000)}`
  });

  stockMovementsState.unshift(newLog);

  res.json({ success: true, batch: newBatch, movement: newLog });
});

// POST /api/inventory/quarantine - Quarantine hold / release for product recall & traceability
//   body: { batchNo, sku?, quarantineReason?, action?: 'HOLD' | 'RELEASE' }
//   Without `action` it flips the current state (what the screen's button does).
app.post('/api/inventory/quarantine', (req, res) => {
  const { batchNo, sku, quarantineReason, action } = req.body;

  if (!batchNo) return res.status(400).json({ error: 'batchNo is required.' });
  if (action !== undefined && action !== 'HOLD' && action !== 'RELEASE') {
    return res.status(400).json({ error: "action must be 'HOLD' or 'RELEASE'." });
  }

  const targetBatches = batchesState.filter((b) => b.batchNo === batchNo && (!sku || b.sku === sku));
  if (targetBatches.length === 0) {
    return res.status(404).json({ error: `Batch No ${batchNo} not found.` });
  }
  if (targetBatches.some((b) => b.status === 'RECALLED' || b.status === 'EXPIRED')) {
    return res.status(400).json({ error: `Batch ${batchNo} is ${targetBatches.find((b) => b.status === 'RECALLED' || b.status === 'EXPIRED')!.status} and cannot be held or released here.` });
  }

  const hold = action ? action === 'HOLD' : targetBatches[0].status !== 'QUARANTINED';
  const newStatus: Batch['status'] = hold ? 'QUARANTINED' : 'ACTIVE';

  targetBatches.forEach((batch) => {
    batch.status = newStatus;
    batch.quantityAvailable = hold ? 0 : Math.max(0, batch.quantityOnHand - batch.quantityAllocated);
    batch.notes = quarantineReason ? `${hold ? 'Quarantine Notice' : 'Release Note'}: ${quarantineReason}` : batch.notes;
  });

  const movementLog = newMovement({
    type: hold ? 'QUARANTINE_HOLD' : 'QUARANTINE_RELEASE',
    sku: targetBatches[0].sku,
    itemName: targetBatches[0].itemName,
    batchNo,
    fromLocation: hold ? undefined : 'QUARANTINE_LOCKER',
    toLocation: hold ? 'QUARANTINE_LOCKER' : targetBatches[0].locationId,
    quantity: targetBatches.reduce((sum, b) => sum + b.quantityOnHand, 0),
    operator: (req as any).user?.name || 'QA Safety Auditor',
    referenceDoc: `${hold ? 'RECALL' : 'RELEASE'}-${Math.floor(100 + Math.random() * 900)}`
  });

  stockMovementsState.unshift(movementLog);
  syncInventoryAndMatrixState();

  res.json({
    success: true,
    batchNo,
    newStatus,
    updatedCount: targetBatches.length,
    movementLog
  });
});

// POST /api/inventory/outbound - Loose Stock Out / Outbound Request with Remark & Purpose, linked to Sales Order update
app.post('/api/inventory/outbound', (req, res) => {
  const {
    sku,
    batchNo,
    quantity,
    outboundPurpose,
    remark,
    operator,
    destination,
    salesOrderId,
    salesOrderItemId,
    createSalesOrderRecord,
    customerName
  } = req.body;

  if (!sku || !isPositive(quantity)) {
    return res.status(400).json({ error: 'Missing required fields or invalid quantity (> 0).' });
  }
  const qtyNum = Number(quantity);

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found in inventory master.` });
  }

  // 1) Check the sales order FIRST, so a typo can never ship stock without an order.
  let existingOrder: PickOrder | null = null;
  if (salesOrderId) {
    existingOrder = ordersState.find((o) => o.id === salesOrderId || o.salesOrderNo === salesOrderId) || null;
    if (!existingOrder) {
      return res.status(404).json({ error: `Sales Order ${salesOrderId} not found. Nothing was shipped.` });
    }
    if (existingOrder.isLocked) {
      return res.status(400).json({ error: `Sales Order ${salesOrderId} is locked. Unlock it first.` });
    }
  }

  // 2) Decide which batch(es) the stock comes from.
  const picks: Array<{ batch: Batch; qty: number }> = [];
  if (batchNo && batchNo !== 'AUTO_FEFO') {
    const chosen = batchesState.find((b) => b.batchNo === batchNo && b.sku === sku);
    if (!chosen) {
      return res.status(404).json({ error: `Batch ${batchNo} for SKU ${sku} not found.` });
    }
    if (chosen.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Batch ${batchNo} is ${chosen.status} and cannot be shipped.` });
    }
    if (chosen.quantityOnHand < qtyNum && !allowNegativeStock) {
      return res.status(400).json({
        error: `Insufficient stock in batch ${chosen.batchNo}. Available on hand: ${chosen.quantityOnHand}, Requested Outbound: ${qtyNum}.`
      });
    }
    picks.push({ batch: chosen, qty: qtyNum });
  } else {
    // FEFO: take from the earliest best-before first and continue into the next batch if needed.
    const candidates = fefoBatches(sku);
    const totalAvailable = candidates.reduce((sum, b) => sum + b.quantityOnHand, 0);
    // With negative stock allowed, a SKU with no stock left may still ship from its earliest usable batch.
    const fallback = allowNegativeStock
      ? batchesState
          .filter((b) => b.sku === sku && b.status === 'ACTIVE' && !isExpired(b.bestBeforeDate))
          .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime())[0]
      : undefined;
    if (candidates.length === 0 && !fallback) {
      return res.status(400).json({ error: `No shippable (active, non-expired) batches with stock for SKU ${sku}.` });
    }
    if (totalAvailable < qtyNum && !allowNegativeStock) {
      return res.status(400).json({
        error: `Insufficient stock for SKU ${sku}. Shippable on hand: ${totalAvailable}, Requested Outbound: ${qtyNum}.`
      });
    }
    let remaining = qtyNum;
    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantityOnHand, remaining);
      picks.push({ batch: b, qty: take });
      remaining -= take;
    }
    if (remaining > 0) {
      // Negative stock allowed: the shortfall goes on the last batch used (or the fallback batch).
      const last = picks.length ? picks[picks.length - 1] : null;
      if (last) last.qty += remaining;
      else picks.push({ batch: fallback!, qty: remaining });
    }
  }

  const timestampStr = nowStamp();
  const purposeStr = outboundPurpose || 'Loose Stock Out Request';
  const remarkStr = remark ? String(remark).trim() : 'No remark specified';
  const destLocation = destination || 'Outbound Loose Dispatch Area';
  const opName = operator || (req as any).user?.name || 'Warehouse Dispatch Operator';

  // 3) Deduct physical batch stock.
  picks.forEach(({ batch, qty }) => {
    batch.quantityOnHand -= qty;
    batch.quantityAvailable = Math.max(0, batch.quantityOnHand - batch.quantityAllocated);
  });
  const targetBatch = picks[0].batch;
  const batchList = picks.map((p) => `${p.batch.batchNo} x${p.qty}`).join(', ');

  let linkedOrder: PickOrder | null = null;
  let referenceDocNumber = `OUT-LOOSE-${Math.floor(1000 + Math.random() * 9000)}`;

  // Case 1: Linked to an existing Sales Order
  if (existingOrder) {
    linkedOrder = existingOrder;
    referenceDocNumber = linkedOrder.salesOrderNo || linkedOrder.id;

    // Find target line item in the sales order
    let targetItem = salesOrderItemId
      ? linkedOrder.items.find((i) => i.id === salesOrderItemId)
      : linkedOrder.items.find((i) => i.sku === sku);

    if (!targetItem) {
      // If not found in order, add as an additional loose item row
      targetItem = {
        id: `ITEM-${linkedOrder.id}-${linkedOrder.items.length + 1}`,
        sku,
        itemName: skuObj.name,
        requestedQty: qtyNum,
        orderQtyCtn: qtyNum,
        allocateQty: qtyNum,
        fulfillmentQty: qtyNum,
        outstandingQty: 0,
        pickedQty: qtyNum,
        isPicked: true,
        remark: `[Loose Out: ${purposeStr}] ${remarkStr}`
      };
      linkedOrder.items.push(targetItem);
    } else {
      // Update existing item fulfillment
      targetItem.fulfillmentQty = (targetItem.fulfillmentQty || 0) + qtyNum;
      targetItem.pickedQty = (targetItem.pickedQty || 0) + qtyNum;
      const requested = targetItem.orderQtyCtn ?? targetItem.requestedQty ?? 0;
      targetItem.outstandingQty = Math.max(0, requested - targetItem.fulfillmentQty);
      targetItem.isPicked = targetItem.fulfillmentQty >= requested;

      const timestampNote = timestampStr.slice(11, 16);
      targetItem.remark = targetItem.remark
        ? `${targetItem.remark} | [${timestampNote} Loose Out ${qtyNum} CTN (${purposeStr}): ${remarkStr}]`
        : `[Loose Out ${qtyNum} CTN (${purposeStr}): ${remarkStr}]`;
    }

    recalcOrderTotals(linkedOrder);

    // Update Sales Order status
    if ((linkedOrder.totalFulfilledCtn || 0) >= (linkedOrder.totalOrderCtn || 0) && (linkedOrder.totalOrderCtn || 0) > 0) {
      linkedOrder.fulfillmentStatus = 'FULFILLED';
      linkedOrder.status = 'DONE';
    } else {
      linkedOrder.fulfillmentStatus = 'PARTIAL';
    }

    linkedOrder.remark = linkedOrder.remark
      ? `${linkedOrder.remark} | [Loose Outbound: ${qtyNum} CTN of ${sku} (${purposeStr})]`
      : `[Loose Outbound: ${qtyNum} CTN of ${sku} (${purposeStr}): ${remarkStr}]`;
  } else if (createSalesOrderRecord) {
    // Case 2: Standalone loose outbound with option to create a tracked Sales Order record
    const soNumber = numId('SO-LOOSE', ordersState, (o) => o.salesOrderNo);
    const newOrderId = numId('ORD', ordersState);
    referenceDocNumber = soNumber;

    linkedOrder = {
      id: newOrderId,
      salesOrderNo: soNumber,
      poNumber: `LOOSE-REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: customerName ? customerName.trim() : `Loose Request (${purposeStr})`,
      orderDate: timestampStr,
      requiredDeliveryDate: timestampStr.slice(0, 10),
      status: 'DONE',
      priority: 'NORMAL',
      destinationZone: destLocation,
      fulfillmentStatus: 'FULFILLED',
      totalOrderCtn: qtyNum,
      totalAllocatedCtn: qtyNum,
      totalFulfilledCtn: qtyNum,
      totalOutstandingCtn: 0,
      remark: `[Purpose: ${purposeStr}] ${remarkStr}`,
      items: [
        {
          id: `ITEM-${newOrderId}-1`,
          sku,
          itemName: skuObj.name,
          requestedQty: qtyNum,
          orderQtyCtn: qtyNum,
          allocateQty: qtyNum,
          fulfillmentQty: qtyNum,
          outstandingQty: 0,
          pickedQty: qtyNum,
          isPicked: true,
          remark: `Loose stock out: ${remarkStr}`
        }
      ]
    };

    ordersState.unshift(linkedOrder);
  }

  // 4) One stock movement per batch the stock came from.
  const movements = picks.map(({ batch, qty }) =>
    newMovement({
      type: 'DISPATCH',
      sku,
      itemName: skuObj.name,
      batchNo: batch.batchNo,
      fromLocation: batch.locationId,
      toLocation: destLocation,
      quantity: qty,
      operator: opName,
      referenceDoc: referenceDocNumber
    })
  );
  movements.slice().reverse().forEach((m) => stockMovementsState.unshift(m));
  const movementLog = movements[0];

  // Sync entire inventory balance matrix & reserved calculations
  syncInventoryAndMatrixState();

  const warnings: string[] = [];
  const skuAfter = skusState.find((s) => s.sku === sku);
  if (skuAfter && (skuAfter.exactQty ?? 0) < 0) {
    warnings.push(`Open orders have reserved more ${sku} than is now in stock (short by ${Math.abs(skuAfter.exactQty!)}). Re-check allocations.`);
  }
  picks.filter((p) => p.batch.quantityOnHand < 0).forEach((p) =>
    warnings.push(`Batch ${p.batch.batchNo} is now NEGATIVE (${p.batch.quantityOnHand}). Negative stock is allowed by the Admin setting; receive or adjust stock to correct it.`)
  );

  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-OPERATOR-101',
    userName: opName,
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_OUT_DISPATCH',
    targetEntity: `${sku} / ${targetBatch.batchNo}`,
    details: `Outbound loose stock of ${qtyNum} CTN (${purposeStr}). Remark: "${remarkStr}". Deducted from ${batchList}. ${
      linkedOrder ? `Updated Sales Order ${linkedOrder.salesOrderNo || linkedOrder.id}.` : ''
    }`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    message: `Successfully outbounded ${qtyNum} CTN of ${skuObj.name} (${picks.length > 1 ? 'Lots ' : 'Lot '}${picks.map((p) => p.batch.batchNo).join(', ')}).`,
    batch: targetBatch,
    batchesUsed: picks.map((p) => ({ batchNo: p.batch.batchNo, qty: p.qty })),
    warnings,
    movement: movementLog,
    movements,
    order: linkedOrder,
    skus: skusState,
    batches: batchesState,
    orders: ordersState,
    auditLog: auditEntry
  });
});

// POST /api/inventory/adjust - Stock Take Adjustment (Physical Count Variance, Add, Deduct)
app.post('/api/inventory/adjust', (req, res) => {
  const { sku, batchNo, adjustmentType, countedQuantity, reasonCode, notes, operator, locationId } = req.body;

  if (!sku || countedQuantity === undefined || countedQuantity === null || countedQuantity === '') {
    return res.status(400).json({ error: 'Missing required fields: sku, countedQuantity' });
  }

  const type: 'SET_EXACT' | 'ADD' | 'SUBTRACT' = adjustmentType || 'SET_EXACT';
  if (!['SET_EXACT', 'ADD', 'SUBTRACT'].includes(type)) {
    return res.status(400).json({ error: `Unknown adjustment type '${type}'.` });
  }
  const qtyNum = Number(countedQuantity);
  if (!Number.isFinite(qtyNum) || qtyNum < 0 || (type !== 'SET_EXACT' && qtyNum === 0)) {
    return res.status(400).json({
      error: type === 'SET_EXACT' ? 'Counted quantity must be a number, 0 or more.' : 'Quantity must be a number greater than 0.'
    });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found.` });
  }

  const timestampStr = nowStamp();
  let variance = 0;

  // Find the targeted batch (batch numbers are only unique per SKU).
  let targetBatch: Batch | null = null;
  if (batchNo) {
    targetBatch = batchesState.find((b) => b.batchNo === batchNo && b.sku === sku) || null;
  } else {
    const skuBatches = batchesState.filter((b) => b.sku === sku);
    if (skuBatches.length > 1) {
      return res.status(400).json({ error: `SKU ${sku} has ${skuBatches.length} batches. Choose which batch you counted.` });
    }
    targetBatch = skuBatches[0] || null;
  }

  if (targetBatch) {
    const prevQty = targetBatch.quantityOnHand;
    if (type === 'SET_EXACT') {
      variance = qtyNum - prevQty;
      targetBatch.quantityOnHand = qtyNum;
    } else if (type === 'ADD') {
      variance = qtyNum;
      targetBatch.quantityOnHand += qtyNum;
    } else {
      if (qtyNum > prevQty && !allowNegativeStock) {
        return res.status(400).json({ error: `Cannot subtract ${qtyNum}; batch ${targetBatch.batchNo} only has ${prevQty} on hand.` });
      }
      variance = -qtyNum;
      targetBatch.quantityOnHand = prevQty - qtyNum;
    }
    targetBatch.quantityAvailable = Math.max(0, targetBatch.quantityOnHand - targetBatch.quantityAllocated);
    targetBatch.notes = notes ? `Stock Take Adj (${reasonCode || 'CYCLE_COUNT'}): ${notes}` : targetBatch.notes;
  } else {
    if (type === 'SUBTRACT') {
      return res.status(400).json({ error: `SKU ${sku} has no stock batch to subtract from.` });
    }
    // If no batch exists, create an adjustment batch lot
    const newBatchNo = batchNo || `BATCH-ADJ-${uid()}`;
    const newQty = qtyNum;
    variance = newQty;

    targetBatch = {
      id: `LOT-ADJ-${uid()}`,
      batchNo: newBatchNo,
      sku,
      itemName: skuObj.name,
      manufactureDate: todayStr(),
      bestBeforeDate: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
      supplier: 'Stock Take Adjustment',
      locationId: locationId || 'BAY-ADJ-01',
      quantityOnHand: newQty,
      quantityAllocated: 0,
      quantityAvailable: newQty,
      unitCost: skuObj.unitCost || 14.5,
      status: 'ACTIVE',
      receivedAt: timestampStr,
      notes: `Created via Stock Take Adjustment (${reasonCode || 'CYCLE_COUNT'})`
    };
    batchesState.unshift(targetBatch);
  }

  // Record Stock Movement log
  const movementLog = newMovement({
    type: 'ADJUSTMENT',
    sku,
    itemName: skuObj.name,
    batchNo: targetBatch.batchNo,
    fromLocation: variance < 0 ? targetBatch.locationId || 'BAY-MAIN' : 'ADJUSTMENT_VIRTUAL',
    toLocation: variance >= 0 ? targetBatch.locationId || 'BAY-MAIN' : 'SHRINKAGE_DISPOSAL',
    quantity: Math.abs(variance),
    operator: operator || (req as any).user?.name || 'Stock Auditor',
    referenceDoc: `ADJ-${reasonCode || 'CYCLE_COUNT'}-${Math.floor(1000 + Math.random() * 9000)}`
  });
  stockMovementsState.unshift(movementLog);

  syncInventoryAndMatrixState();

  // Record Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-AUDITOR-202',
    userName: operator || 'Stock Take Auditor',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_ADJUSTED',
    targetEntity: sku,
    details: `Stock Take Adjustment for ${skuObj.name} (${sku}): Mode=${type}, Quantity=${qtyNum}, Net Variance=${variance > 0 ? '+' : ''}${variance} units. Reason: ${reasonCode || 'CYCLE_COUNT'}. Notes: ${notes || 'None'}`,
    severity: variance === 0 ? 'INFO' : Math.abs(variance) > 50 ? 'WARNING' : 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    variance,
    batch: targetBatch,
    sku: skuObj,
    movement: movementLog,
    audit: auditEntry
  });
});

// POST /api/inventory/import-skus - Bulk CSV SKU Import
app.post('/api/inventory/import-skus', (req, res) => {
  const { items, operator, mode = 'OVERWRITE' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid SKU items provided in request array.' });
  }

  const importedSKUs: ProductSKU[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const timestampStr = nowStamp();

  items.forEach((item) => {
    if (!item.sku || !item.name) return;

    const skuCode = String(item.sku).trim().toUpperCase();
    const existingIndex = skusState.findIndex((s) => s.sku === skuCode);

    const minLevel = Number(item.minStockLevel) || 20;
    const reorderQty = Number(item.reorderQuantity) || 50;
    const cost = Number(item.unitCost) || 14.5;
    const initQty = Number(item.initialQty ?? item.currentQty) || 0;

    const skuPayload: ProductSKU = {
      sku: skuCode,
      name: String(item.name).trim(),
      category: String(item.category || 'General Products').trim(),
      currentQty: initQty,
      exactQty: initQty,
      stockIn: initQty,
      stockOut: 0,
      reserved: 0,
      balanceForward: initQty,
      minStockLevel: minLevel,
      reorderQuantity: reorderQty,
      reorderPoint: minLevel,
      safetyStock: Math.round(minLevel / 2),
      weightPerUnitKg: Number(item.weightPerUnitKg) || 1.2,
      barcode: String(item.barcode || skuCode),
      unitCost: cost,
      unit: String(item.unit || 'Bottle').trim(),
      storageZone: item.storageZone || 'DRY',
      description: String(item.description || 'Imported via CSV Bulk Upload').trim(),
      monthlyBalances: {
        JAN: initQty, FEB: initQty, MAR: initQty, APR: initQty, MAY: initQty, JUN: initQty,
        JUL: initQty, AUG: initQty, SEP: initQty, OCT: initQty, NOV: initQty, DEC: initQty
      }
    };

    if (existingIndex >= 0) {
      if (mode === 'SKIP_EXISTING') {
        skippedCount++;
        return; // Skip modifying existing
      } else if (mode === 'MERGE_STOCK') {
        const existing = skusState[existingIndex];
        existing.currentQty = (existing.currentQty || 0) + initQty;
        existing.exactQty = (existing.exactQty || 0) + initQty;
        existing.stockIn = (existing.stockIn || 0) + initQty;
        updatedCount++;
        importedSKUs.push(existing);
      } else {
        // OVERWRITE mode
        skusState[existingIndex] = { ...skusState[existingIndex], ...skuPayload };
        updatedCount++;
        importedSKUs.push(skusState[existingIndex]);
      }
    } else {
      skusState.push(skuPayload);
      addedCount++;
      importedSKUs.push(skuPayload);
    }
  });

  // Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-CSV-IMP',
    userName: operator || 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_CREATED',
    targetEntity: 'SKU Catalog CSV Bulk Import',
    details: `Bulk CSV SKU Import (${mode} mode). Total Processed: ${importedSKUs.length} (Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    addedCount,
    updatedCount,
    skippedCount,
    totalProcessed: items.length,
    skus: importedSKUs
  });
});

// POST /api/inventory/import-batches - Bulk CSV Batch Lots Import
app.post('/api/inventory/import-batches', (req, res) => {
  const { items, operator, mode = 'OVERWRITE' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid batch items provided in request array.' });
  }
  if (!['OVERWRITE', 'SKIP_EXISTING', 'MERGE_STOCK'].includes(mode)) {
    return res.status(400).json({ error: `Unknown import mode '${mode}'.` });
  }

  const importedBatches: Batch[] = [];
  const rejected: Array<{ row: number; batchNo?: string; reason: string }> = [];
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const timestampStr = nowStamp();

  items.forEach((item, rowIdx) => {
    const reject = (reason: string) => rejected.push({ row: rowIdx + 1, batchNo: item?.batchNo ? String(item.batchNo) : undefined, reason });
    if (!item || !item.batchNo || !item.sku) return reject('Missing batch number or SKU.');

    const batchNoCode = String(item.batchNo).trim().toUpperCase();
    const skuCode = String(item.sku).trim().toUpperCase();
    // A batch number is only unique within one SKU.
    const existingIndex = batchesState.findIndex((b) => b.batchNo === batchNoCode && b.sku === skuCode);

    const rawQty = item.quantityOnHand ?? item.quantity ?? 0;
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty < 0) return reject(`Quantity '${rawQty}' is not a valid number.`);
    if (item.bestBeforeDate && !isValidDate(item.bestBeforeDate)) return reject(`Best-before date '${item.bestBeforeDate}' is not valid (use YYYY-MM-DD).`);
    if (item.manufactureDate && !isValidDate(item.manufactureDate)) return reject(`Manufacture date '${item.manufactureDate}' is not valid (use YYYY-MM-DD).`);

    const skuObj = skusState.find((s) => s.sku === skuCode);
    if (!skuObj) return reject(`SKU ${skuCode} is not in the catalog. Import the SKU first.`);

    const cost = Number(item.unitCost) || 14.5;
    const mfgDate = item.manufactureDate || todayStr();
    const bbdDate = item.bestBeforeDate || new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0];

    // The screens use QUARANTINED; accept the spelling QUARANTINE in files too.
    const statusText = String(item.status || '').trim().toUpperCase();
    const status: Batch['status'] =
      statusText === 'QUARANTINE' || statusText === 'QUARANTINED' ? 'QUARANTINED' : statusText === 'RECALLED' ? 'RECALLED' : 'ACTIVE';

    const batchPayload: Batch = {
      id: `LOT-IMP-${uid()}`,
      batchNo: batchNoCode,
      sku: skuCode,
      itemName: skuObj.name,
      manufactureDate: mfgDate,
      bestBeforeDate: bbdDate,
      supplier: String(item.supplier || 'CSV Import Supplier').trim(),
      locationId: String(item.locationId || 'BAY-MAIN').trim(),
      quantityOnHand: qty,
      quantityAllocated: 0,
      quantityAvailable: status === 'ACTIVE' ? qty : 0,
      unitCost: cost,
      status,
      receivedAt: timestampStr,
      notes: String(item.notes || 'Imported via CSV Batch Upload').trim()
    };

    if (existingIndex >= 0) {
      if (mode === 'SKIP_EXISTING') {
        skippedCount++;
        return;
      } else if (mode === 'MERGE_STOCK') {
        const existingB = batchesState[existingIndex];
        existingB.quantityOnHand += qty;
        existingB.quantityAvailable += qty;
        updatedCount++;
        importedBatches.push(existingB);
      } else {
        batchesState[existingIndex] = { ...batchesState[existingIndex], ...batchPayload, id: batchesState[existingIndex].id };
        updatedCount++;
        importedBatches.push(batchesState[existingIndex]);
      }
    } else {
      batchesState.unshift(batchPayload);
      addedCount++;
      importedBatches.push(batchPayload);
    }
  });

  syncInventoryAndMatrixState();

  // Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-CSV-IMP',
    userName: operator || 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'INBOUND_RECEIVED',
    targetEntity: 'Batch Lots CSV Bulk Import',
    details: `Bulk Batch CSV Import (${mode} mode). Processed: ${items.length} (Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Rejected: ${rejected.length}).`,
    severity: rejected.length ? 'WARNING' : 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    addedCount,
    updatedCount,
    skippedCount,
    rejectedCount: rejected.length,
    rejected,
    totalProcessed: items.length,
    batches: importedBatches
  });
});

// GET /api/purchase-orders - Fetch generated purchase orders
app.get('/api/purchase-orders', (req, res) => {
  res.json(purchaseOrdersState);
});

// POST /api/skus - Create new SKU catalog entry
app.post('/api/skus', (req, res) => {
  const { sku, name, category, description, unit, reorderPoint, safetyStock, barcode, storageZone } = req.body;

  if (!sku || !name || !category) {
    return res.status(400).json({ error: 'Missing required SKU parameters: sku, name, category' });
  }

  const existing = skusState.find((s) => s.sku.toLowerCase() === sku.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: `SKU code '${sku}' already exists in catalog.` });
  }

  const newSku: ProductSKU = {
    sku: sku.toUpperCase().trim(),
    name: name.trim(),
    category: category.trim(),
    description: description || `${name} product SKU`,
    unit: unit || 'units',
    reorderPoint: Number(reorderPoint || 100),
    safetyStock: Number(safetyStock || 50),
    weightPerUnitKg: Number(req.body.weightPerUnitKg || 1.2),
    barcode: barcode || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
    storageZone: storageZone || 'DRY'
  };

  skusState.unshift(newSku);

  // Add audit log
  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_CREATED',
    targetEntity: newSku.sku,
    details: `Created new SKU entry '${newSku.sku}' (${newSku.name}) under category '${newSku.category}' with reorder point ${newSku.reorderPoint}.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, sku: newSku, auditLog: auditEntry });
});

// PUT /api/skus/:skuCode - Update SKU catalog item details (Category, Name, Description, etc.)
app.put('/api/skus/:skuCode', (req, res) => {
  const { skuCode } = req.params;
  const { name, category, description, unit, reorderPoint, safetyStock, storageZone, weightPerUnitKg } = req.body;

  const targetIndex = skusState.findIndex((s) => s.sku.toLowerCase() === skuCode.toLowerCase());
  if (targetIndex === -1) {
    return res.status(404).json({ error: `SKU '${skuCode}' not found in catalog.` });
  }

  const existing = skusState[targetIndex];
  const oldCategory = existing.category;
  const updatedSku: ProductSKU = {
    ...existing,
    ...(name && { name: name.trim() }),
    ...(category && { category: category.trim() }),
    ...(description !== undefined && { description: description.trim() }),
    ...(unit && { unit: unit.trim() }),
    ...(reorderPoint !== undefined && { reorderPoint: Number(reorderPoint) }),
    ...(safetyStock !== undefined && { safetyStock: Number(safetyStock) }),
    ...(storageZone && { storageZone }),
    ...(weightPerUnitKg !== undefined && { weightPerUnitKg: Number(weightPerUnitKg) })
  };

  skusState[targetIndex] = updatedSku;

  // Also update category on matching batches if category changed
  if (category && category !== oldCategory) {
    batchesState.forEach((b) => {
      if (b.sku.toLowerCase() === skuCode.toLowerCase()) {
        b.category = category.trim();
      }
    });
  }

  // Add audit log
  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_UPDATED',
    targetEntity: updatedSku.sku,
    details: `Updated SKU '${updatedSku.sku}' details. Category changed from '${oldCategory}' to '${updatedSku.category}'.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, sku: updatedSku, auditLog: auditEntry });
});

// PUT /api/categories/rename - Rename an existing category globally across all SKUs and Batches
app.put('/api/categories/rename', (req, res) => {
  const { oldCategory, newCategory } = req.body;

  if (!oldCategory || !newCategory || !oldCategory.trim() || !newCategory.trim()) {
    return res.status(400).json({ error: 'Both oldCategory and newCategory are required.' });
  }

  const oldCatClean = oldCategory.trim();
  const newCatClean = newCategory.trim();

  let skuCount = 0;
  skusState.forEach((s) => {
    if (s.category.toLowerCase() === oldCatClean.toLowerCase()) {
      s.category = newCatClean;
      skuCount++;
    }
  });

  let batchCount = 0;
  batchesState.forEach((b) => {
    if (b.category && b.category.toLowerCase() === oldCatClean.toLowerCase()) {
      b.category = newCatClean;
      batchCount++;
    }
  });

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CATEGORY_RENAMED',
    targetEntity: oldCatClean,
    details: `Globally renamed category '${oldCatClean}' to '${newCatClean}' across ${skuCount} SKUs and ${batchCount} batches.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    oldCategory: oldCatClean,
    newCategory: newCatClean,
    updatedSkusCount: skuCount,
    updatedBatchesCount: batchCount,
    auditLog: auditEntry
  });
});

// POST /api/categories/delete - Delete a category and reassign SKUs to a target category
app.post('/api/categories/delete', (req, res) => {
  const { categoryName, reassignTo = 'General Products' } = req.body;

  if (!categoryName || !categoryName.trim()) {
    return res.status(400).json({ error: 'categoryName is required.' });
  }

  const catClean = categoryName.trim();
  const targetCat = reassignTo.trim();

  let skuCount = 0;
  skusState.forEach((s) => {
    if (s.category.toLowerCase() === catClean.toLowerCase()) {
      s.category = targetCat;
      skuCount++;
    }
  });

  let batchCount = 0;
  batchesState.forEach((b) => {
    if (b.category && b.category.toLowerCase() === catClean.toLowerCase()) {
      b.category = targetCat;
      batchCount++;
    }
  });

  if (!deletedCategoriesState.includes(catClean)) {
    deletedCategoriesState.push(catClean);
  }

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CATEGORY_DELETED',
    targetEntity: catClean,
    details: `Deleted category '${catClean}' and reassigned ${skuCount} SKUs to '${targetCat}'.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    deletedCategory: catClean,
    reassignedTo: targetCat,
    updatedSkusCount: skuCount,
    updatedBatchesCount: batchCount,
    auditLog: auditEntry
  });
});

// POST /api/locations - Create a new Warehouse Facility Bin Location
app.post('/api/locations', (req, res) => {
  const { aisle, rack, shelf, bin, zone, capacityKg, gridX, gridY } = req.body;

  if (!aisle || !rack || !shelf || !bin || !zone) {
    return res.status(400).json({ error: 'Missing required location fields: aisle, rack, shelf, bin, zone' });
  }

  const rackNum = Number(rack);
  const shelfNum = Number(shelf);
  const aisleUpper = String(aisle).trim().toUpperCase();
  const binStr = String(bin).trim().padStart(2, '0');
  const id = `${aisleUpper}-${String(rackNum).padStart(2, '0')}-${binStr}`;

  const existing = locationsState.find((l) => l.id === id);
  if (existing) {
    return res.status(400).json({ error: `Location ID ${id} already exists in warehouse grid.` });
  }

  const newLoc = {
    id,
    aisle: aisleUpper,
    rack: rackNum,
    shelf: shelfNum,
    bin: binStr,
    zone: zone || 'DRY',
    gridX: gridX || (aisleUpper === 'A' ? 2 : aisleUpper === 'B' ? 6 : aisleUpper === 'C' ? 10 : 14),
    gridY: gridY || (rackNum * 2),
    capacityKg: Number(capacityKg) || 500,
    currentKg: 0
  };

  locationsState.push(newLoc);

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'LOCATION_CREATED',
    targetEntity: id,
    details: `Created new Putaway Bin Location ${id} in Zone ${zone} (Aisle ${aisleUpper}, Rack ${rackNum}, Capacity ${newLoc.capacityKg}kg).`,
    severity: 'INFO'
  });

  res.json({ success: true, location: newLoc, locations: locationsState });
});

// PUT /api/locations/:id - Update an existing Warehouse Bin Location
app.put('/api/locations/:id', (req, res) => {
  const { id } = req.params;
  const index = locationsState.findIndex((l) => l.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Location ID ${id} not found.` });
  }

  locationsState[index] = {
    ...locationsState[index],
    ...req.body
  };

  res.json({ success: true, location: locationsState[index], locations: locationsState });
});

// DELETE /api/locations/:id - Delete a Warehouse Bin Location
app.delete('/api/locations/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = locationsState.findIndex((l) => l.id === decodedId || l.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Location ID ${decodedId} not found.` });
  }

  // Refuse to delete a bin that still holds stock (it would disappear from picking routes).
  const stillInside = batchesState.filter((b) => b.locationId === locationsState[index].id && b.quantityOnHand > 0);
  if (stillInside.length > 0) {
    return res.status(400).json({
      error: `Location ${locationsState[index].id} still holds stock (${stillInside.map((b) => `${b.batchNo} x${b.quantityOnHand}`).join(', ')}). Move or adjust it first.`
    });
  }

  const removed = locationsState.splice(index, 1)[0];

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'LOCATION_DELETED',
    targetEntity: removed.id,
    details: `Deleted Warehouse Bin Location ${removed.id}.`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: removed.id, locations: locationsState });
});

// ==========================================
// WAREHOUSE FACILITIES API
// ==========================================

// GET /api/facilities
app.get('/api/facilities', (req, res) => {
  res.json(facilitiesState);
});

// POST /api/facilities - Create new warehouse facility
app.post('/api/facilities', (req, res) => {
  const { code, name, address, managerName, contactPhone, status, totalAreaSqFt } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Facility code and name are required.' });
  }

  const existing = facilitiesState.find((f) => f.code.toUpperCase() === String(code).trim().toUpperCase());
  if (existing) {
    return res.status(400).json({ error: `Facility with code '${code}' already exists.` });
  }

  const newFacility: WarehouseFacility = {
    id: `FAC-${String(facilitiesState.length + 1).padStart(2, '0')}`,
    code: String(code).trim().toUpperCase(),
    name: String(name).trim(),
    address: address || '',
    managerName: managerName || 'Unassigned',
    contactPhone: contactPhone || '',
    status: status || 'ACTIVE',
    totalAreaSqFt: Number(totalAreaSqFt) || 25000
  };

  facilitiesState.push(newFacility);

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_CREATED',
    targetEntity: newFacility.id,
    details: `Created new Warehouse Facility '${newFacility.name}' (${newFacility.code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, facility: newFacility, facilities: facilitiesState });
});

// PUT /api/facilities/:id - Update facility profile
app.put('/api/facilities/:id', (req, res) => {
  const { id } = req.params;
  const index = facilitiesState.findIndex((f) => f.id === id || f.code === id);

  if (index === -1) {
    return res.status(404).json({ error: `Facility '${id}' not found.` });
  }

  facilitiesState[index] = {
    ...facilitiesState[index],
    ...req.body
  };

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_UPDATED',
    targetEntity: facilitiesState[index].id,
    details: `Updated Warehouse Facility profile '${facilitiesState[index].name}' (${facilitiesState[index].code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, facility: facilitiesState[index], facilities: facilitiesState });
});

// DELETE /api/facilities/:id - Delete facility
app.delete('/api/facilities/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = facilitiesState.findIndex((f) => f.id === decodedId || f.code === decodedId || f.id === id || f.code === id);

  if (index === -1) {
    return res.status(404).json({ error: `Facility '${decodedId}' not found.` });
  }

  const deletedFacility = facilitiesState.splice(index, 1)[0];

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_DELETED',
    targetEntity: decodedId,
    details: `Deleted Warehouse Facility '${deletedFacility.name}' (${deletedFacility.code}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: decodedId, facilities: facilitiesState });
});

// ==========================================
// STORAGE ZONES API
// ==========================================

// GET /api/zones
app.get('/api/zones', (req, res) => {
  res.json(zonesState);
});

// POST /api/zones - Create new storage zone
app.post('/api/zones', (req, res) => {
  const { code, title, temperatureRange, description, aisle, icon, themeColor, facilityId, maxCapacityKg } = req.body;

  if (!code || !title) {
    return res.status(400).json({ error: 'Zone code and title are required.' });
  }

  const zoneCodeClean = String(code).trim().toUpperCase().replace(/\s+/g, '_');
  const existing = zonesState.find((z) => z.code === zoneCodeClean);

  if (existing) {
    return res.status(400).json({ error: `Storage zone with code '${zoneCodeClean}' already exists.` });
  }

  const newZone: StorageZone = {
    code: zoneCodeClean,
    title: String(title).trim(),
    temperatureRange: temperatureRange || 'Ambient',
    description: description || '',
    aisle: aisle || 'Aisle A',
    icon: icon || '📦',
    themeColor: themeColor || 'emerald',
    facilityId: facilityId || 'FAC-01',
    maxCapacityKg: Number(maxCapacityKg) || 10000
  };

  zonesState.push(newZone);

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_CREATED',
    targetEntity: zoneCodeClean,
    details: `Created new Storage Zone '${newZone.title}' (${zoneCodeClean}).`,
    severity: 'INFO'
  });

  res.json({ success: true, zone: newZone, zones: zonesState });
});

// PUT /api/zones/:code - Update storage zone details
app.put('/api/zones/:code', (req, res) => {
  const { code } = req.params;
  const index = zonesState.findIndex((z) => z.code === code);

  if (index === -1) {
    return res.status(404).json({ error: `Storage zone '${code}' not found.` });
  }

  zonesState[index] = {
    ...zonesState[index],
    ...req.body
  };

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_UPDATED',
    targetEntity: code,
    details: `Updated Storage Zone settings for '${zonesState[index].title}' (${code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, zone: zonesState[index], zones: zonesState });
});

// DELETE /api/zones/:code - Delete storage zone
app.delete('/api/zones/:code', (req, res) => {
  const { code } = req.params;
  const decodedCode = decodeURIComponent(code);
  const index = zonesState.findIndex((z) => z.code === decodedCode || z.code === code);

  if (index === -1) {
    return res.status(404).json({ error: `Storage zone '${decodedCode}' not found.` });
  }

  // Safely reassign locations bound to this zone to 'DRY'
  locationsState.forEach((l) => {
    if (l.zone === zonesState[index].code || l.zone === code) {
      l.zone = 'DRY';
    }
  });

  const deletedZone = zonesState.splice(index, 1)[0];

  const timestampStr = nowStamp();
  auditLogsState.unshift({
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_DELETED',
    targetEntity: decodedCode,
    details: `Deleted Storage Zone '${deletedZone.title}' (${decodedCode}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedCode: decodedCode, zones: zonesState });
});

// POST /api/purchase-orders - Generate purchase order for low-stock SKU
app.post('/api/purchase-orders', (req, res) => {
  const { sku, itemName, supplier, reorderQuantity, unitCost, expectedDeliveryDate, generatedBy, destinationLocationId, notes } = req.body;

  if (!sku || !reorderQuantity) {
    return res.status(400).json({ error: 'Missing required parameters: sku and reorderQuantity' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  const matchedBatch = batchesState.find((b) => b.sku === sku);
  const timestampStr = nowStamp();
  const newPoId = numId('PO-2026', purchaseOrdersState);

  const finalCost = Number(unitCost || matchedBatch?.unitCost || 12.50);
  const finalQty = Number(reorderQuantity);

  const newPo: PurchaseOrder = {
    id: newPoId,
    createdAt: timestampStr,
    sku,
    itemName: itemName || skuObj?.name || 'Reorder Product',
    supplier: supplier || matchedBatch?.supplier || 'Primary Global Logistics',
    reorderQuantity: finalQty,
    unitCost: finalCost,
    totalCost: finalQty * finalCost,
    expectedDeliveryDate: expectedDeliveryDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    status: 'ISSUED',
    generatedBy: generatedBy || 'Warehouse Manager',
    destinationLocationId: destinationLocationId || matchedBatch?.locationId || 'A-01-01',
    notes: notes || `Auto-PO generated for SKU ${sku} due to low stock / reorder threshold reached.`
  };

  purchaseOrdersState.unshift(newPo);

  // Add an audit log entry for this purchase order creation
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: generatedBy || 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INBOUND',
    actionType: 'PURCHASE_ORDER_GENERATED',
    targetEntity: newPoId,
    details: `Generated Purchase Order ${newPoId} for ${finalQty} units of ${newPo.itemName} (${sku}) at $${finalCost}/unit (Total: $${(finalQty * finalCost).toFixed(2)}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, purchaseOrder: newPo, auditLog: auditEntry });
});

// DELETE /api/purchase-orders/:id - Delete a purchase order
app.delete('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);

  const existingIndex = purchaseOrdersState.findIndex((po) => po.id === decodedId);
  if (existingIndex === -1) {
    return res.status(404).json({ error: `Purchase Order '${decodedId}' not found.` });
  }

  const removedPo = purchaseOrdersState[existingIndex];
  purchaseOrdersState.splice(existingIndex, 1);

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INBOUND',
    actionType: 'PURCHASE_ORDER_DELETED',
    targetEntity: decodedId,
    details: `Deleted Purchase Order ${decodedId} for ${removedPo.reorderQuantity} units of ${removedPo.itemName} (${removedPo.sku}).`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, deletedId: decodedId, auditLog: auditEntry });
});

// DELETE /api/stock-movements - Clear all stock movement logs
app.delete('/api/stock-movements', (req, res) => {
  const previousCount = stockMovementsState.length;
  stockMovementsState = [];

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_MOVEMENTS_CLEARED',
    targetEntity: 'Stock Movement Stream',
    details: `Cleared ${previousCount} stock movement log records from system stream.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, clearedCount: previousCount, stockMovements: [], auditLog: auditEntry });
});

// ==========================================
// USER PROFILE MANAGEMENT API ROUTES
// ==========================================

// GET /api/users - Fetch all team member profiles (never includes password data)
app.get('/api/users', (req, res) => {
  res.json(usersState.map(publicUser));
});

// POST /api/users - Create a new team member profile (with a starting password)
app.post('/api/users', (req, res) => {
  const { name, email, role, department, shift, badgeCode, password } = req.body;

  if (!name || !name.trim() || !email || !email.trim() || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required fields.' });
  }
  if (!['Admin', 'Warehouse Manager', 'Picker', 'Receiver'].includes(role)) {
    return res.status(400).json({ error: `Unknown role '${role}'.` });
  }
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (usersState.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(400).json({ error: `A user with e-mail ${email.trim()} already exists.` });
  }

  const newUser: StoredUser = {
    id: numId('USR', usersState),
    name: name.trim(),
    email: email.trim(),
    role: role as UserRole,
    department: department?.trim() || 'Warehouse Operations',
    shift: shift?.trim() || 'First Shift (07:00 - 15:30)',
    badgeCode: badgeCode?.trim() || `BDG-${Math.floor(1000 + Math.random() * 9000)}`,
    passwordHash: hashPassword(password)
  };

  usersState.push(newUser);

  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'USER_CREATED',
    targetEntity: newUser.name,
    details: `Created new team member profile for ${newUser.name} (${newUser.role}, ${newUser.email}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, user: publicUser(newUser), auditLog: auditEntry });
});

// PUT /api/users/:id - Update an existing team member profile (optionally reset the password)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, role, department, shift, badgeCode, password } = req.body;

  const userIndex = usersState.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: `User profile ${id} not found.` });
  }
  // Without the "manage settings" right you may only edit your own details - not role or password.
  const caller = (req as any).user as StoredUser;
  if (!isAllowed(caller.role, ['settings:manage'], rolePermsState)) {
    if (caller.id !== id) return res.status(403).json({ error: 'You can only edit your own profile.' });
    if (role !== undefined && role !== caller.role) return res.status(403).json({ error: 'Only an administrator can change a role.' });
    if (password) return res.status(403).json({ error: 'Use "Change password" to change your own password.' });
  }
  if (role !== undefined && !['Admin', 'Warehouse Manager', 'Picker', 'Receiver'].includes(role)) {
    return res.status(400).json({ error: `Unknown role '${role}'.` });
  }
  if (password !== undefined && password !== '') {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
  }
  if (email !== undefined && usersState.some((u, i) => i !== userIndex && u.email.toLowerCase() === String(email).trim().toLowerCase())) {
    return res.status(400).json({ error: `A user with e-mail ${String(email).trim()} already exists.` });
  }

  const existingUser = usersState[userIndex];
  // Never remove the last administrator.
  if (role !== undefined && role !== 'Admin' && existingUser.role === 'Admin' && usersState.filter((u) => u.role === 'Admin' && !u.disabled).length <= 1) {
    return res.status(400).json({ error: 'There must be at least one Admin. Make someone else Admin first.' });
  }

  const updatedUser: StoredUser = {
    ...existingUser,
    name: name !== undefined ? name.trim() : existingUser.name,
    email: email !== undefined ? email.trim() : existingUser.email,
    role: role !== undefined ? (role as UserRole) : existingUser.role,
    department: department !== undefined ? department.trim() : existingUser.department,
    shift: shift !== undefined ? shift.trim() : existingUser.shift,
    badgeCode: badgeCode !== undefined ? badgeCode.trim() : existingUser.badgeCode,
    passwordHash: password ? hashPassword(password) : existingUser.passwordHash
  };

  usersState[userIndex] = updatedUser;

  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: password ? 'USER_PASSWORD_RESET' : 'USER_PROFILE_UPDATED',
    targetEntity: updatedUser.name,
    details: `Updated team member profile for ${updatedUser.name} (${updatedUser.role}, ${updatedUser.email}).${password ? ' Password was reset.' : ''}`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, user: publicUser(updatedUser), auditLog: auditEntry });
});

// DELETE /api/users/:id - Delete a team member profile
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;

  const targetUser = usersState.find((u) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: `User profile ${id} not found.` });
  }
  if (usersState.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only remaining user in the system.' });
  }
  if (targetUser.role === 'Admin' && usersState.filter((u) => u.role === 'Admin' && !u.disabled).length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last Admin.' });
  }
  if (targetUser.id === (req as any).user?.id) {
    return res.status(400).json({ error: 'You cannot delete your own account while signed in.' });
  }

  usersState = usersState.filter((u) => u.id !== id);

  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'USER_DELETED',
    targetEntity: targetUser.name,
    details: `Deleted team member profile for ${targetUser.name} (${targetUser.role}).`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, deletedId: id, auditLog: auditEntry });
});

// GET /api/orders - Get orders
app.get('/api/orders', (req, res) => {
  res.json(ordersState);
});

// Helper function to sync reserved stock & Catcher Gourmet Internal Sheet Balance Matrix across all SKUs based on active batches, orders, and stock movements
function syncInventoryAndMatrixState() {
  const currentMonthCode = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][new Date().getMonth()];

  // Pre-aggregate active batches by SKU
  const activeBatchesBySku = new Map<string, Batch[]>();
  const batchOnHandBySku = new Map<string, number>();

  batchesState.forEach((batch) => {
    if (batch.status === 'ACTIVE') {
      const existing = activeBatchesBySku.get(batch.sku) || [];
      existing.push(batch);
      activeBatchesBySku.set(batch.sku, existing);

      const currentSum = batchOnHandBySku.get(batch.sku) || 0;
      batchOnHandBySku.set(batch.sku, currentSum + (batch.quantityOnHand || 0));
    }
  });

  // Pre-aggregate stock movements by SKU
  const movementsBySku = new Map<string, { inbound: number; outbound: number }>();
  stockMovementsState.forEach((mov) => {
    const entry = movementsBySku.get(mov.sku) || { inbound: 0, outbound: 0 };
    if (mov.type === 'INBOUND_RECEIVE' || mov.type === 'PUTAWAY') {
      entry.inbound += mov.quantity || 0;
    } else if (mov.type === 'PICKING' || mov.type === 'DISPATCH') {
      entry.outbound += mov.quantity || 0;
    }
    movementsBySku.set(mov.sku, entry);
  });

  // Pre-aggregate reserved stock from open sales orders by SKU
  const reservedStockBySku = new Map<string, number>();
  ordersState.forEach((order) => {
    if (order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'DONE') {
      order.items.forEach((item) => {
        const itemAlloc = item.allocateQty ?? item.requestedQty ?? 0;
        const itemFulfilled = item.fulfillmentQty ?? item.pickedQty ?? 0;
        const activeAlloc = Math.max(0, itemAlloc - itemFulfilled);
        if (activeAlloc > 0) {
          const currentRes = reservedStockBySku.get(item.sku) || 0;
          reservedStockBySku.set(item.sku, currentRes + activeAlloc);
        }
      });
    }
  });

  const monthsList = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ] as const;

  skusState.forEach((skuObj) => {
    const matchingBatches = activeBatchesBySku.get(skuObj.sku) || [];
    const batchOnHand = batchOnHandBySku.get(skuObj.sku) || 0;
    const movs = movementsBySku.get(skuObj.sku) || { inbound: 0, outbound: 0 };
    const skuReserved = reservedStockBySku.get(skuObj.sku) || 0;

    skuObj.reserved = skuReserved;

    const initBal = skuObj.balanceForward ?? skuObj.currentQty ?? batchOnHand;
    skuObj.balanceForward = initBal;

    skuObj.stockIn = movs.inbound > 0 ? (initBal + movs.inbound) : (skuObj.stockIn ?? (initBal + batchOnHand));
    skuObj.stockOut = movs.outbound;

    const realCurrentQty = batchOnHand > 0 || matchingBatches.length > 0 ? batchOnHand : Math.max(0, skuObj.stockIn - skuObj.stockOut);
    skuObj.currentQty = realCurrentQty;
    skuObj.exactQty = realCurrentQty - skuReserved;

    if (!skuObj.monthlyBalances) {
      skuObj.monthlyBalances = {};
    }

    monthsList.forEach((m) => {
      if (skuObj.monthlyBalances![m] === undefined || skuObj.monthlyBalances![m] === null) {
        skuObj.monthlyBalances![m] = realCurrentQty;
      }
    });

    skuObj.monthlyBalances[currentMonthCode as keyof typeof skuObj.monthlyBalances] = realCurrentQty;
  });

  // Re-allocate batches via FEFO for active allocations
  skusState.forEach((skuObj) => {
    let remainingToAlloc = skuObj.reserved || 0;
    const matchingBatches = activeBatchesBySku.get(skuObj.sku) || [];
    if (matchingBatches.length > 0) {
      const sortedBatches = [...matchingBatches].sort(
        (a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime()
      );

      sortedBatches.forEach((batch, idx) => {
        const isLast = idx === sortedBatches.length - 1;
        let allocForBatch = Math.min(batch.quantityOnHand, remainingToAlloc);
        if (isLast && remainingToAlloc > batch.quantityOnHand) {
          allocForBatch = remainingToAlloc;
        }
        batch.quantityAllocated = allocForBatch;
        batch.quantityAvailable = batch.quantityOnHand - allocForBatch;
        remainingToAlloc -= allocForBatch;
      });
    }
  });
}

// Alias for backward compatibility
const syncReservedStockState = syncInventoryAndMatrixState;

// POST /api/matrix/sync - Force sync Catcher Gourmet Internal Sheet Balance Matrix with Database
app.post('/api/matrix/sync', (req, res) => {
  syncInventoryAndMatrixState();

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'MATRIX_SYNCED',
    targetEntity: 'Catcher Gourmet Internal Sheet Balance Matrix',
    details: `Synchronized Catcher Gourmet Internal Sheet Balance Matrix across ${skusState.length} SKUs with live database batches and stock movement logs.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    message: `Successfully synchronized ${skusState.length} SKUs in Catcher Gourmet Internal Sheet Balance Matrix with database`,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders - Create new Sales Order
app.post('/api/sales-orders', (req, res) => {
  const { salesOrderNo, poNumber, customerName, requiredDeliveryDate, priority, destinationZone, items, remark } = req.body;

  if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required sales order fields: customerName and items array' });
  }

  const timestampStr = nowStamp();
  const soNumber = salesOrderNo || numId('SO-2026', ordersState, (o) => o.salesOrderNo);
  const orderId = numId('ORD', ordersState);

  let totalOrderCtn = 0;
  let totalAllocatedCtn = 0;

  for (const item of items) {
    const q = Number(item?.orderQtyCtn || item?.requestedQty || 0);
    if (!item?.sku || !Number.isFinite(q) || q <= 0) {
      return res.status(400).json({ error: 'Every order line needs a SKU and a quantity greater than 0.' });
    }
    if (!skusState.some((s) => s.sku === item.sku)) {
      return res.status(400).json({ error: `SKU ${item.sku} is not in the catalog.` });
    }
  }

  // You cannot reserve stock you do not have: allocation is capped at what is free.
  const freeLeft = new Map<string, number>();
  const warnings: string[] = [];

  const orderItems = items.map((item: any, idx: number) => {
    const skuObj = skusState.find((s) => s.sku === item.sku);
    const orderQty = Number(item.orderQtyCtn || item.requestedQty || 0);
    const wanted = Number(item.allocateQty !== undefined ? item.allocateQty : orderQty);
    if (!freeLeft.has(item.sku)) freeLeft.set(item.sku, freeStockFor(item.sku, ''));
    const allocQty = Math.max(0, Math.min(wanted, freeLeft.get(item.sku)!));
    freeLeft.set(item.sku, freeLeft.get(item.sku)! - allocQty);
    if (allocQty < wanted) warnings.push(`${item.sku}: only ${allocQty} of ${wanted} could be reserved (not enough free stock).`);

    totalOrderCtn += orderQty;
    totalAllocatedCtn += allocQty;

    return {
      id: `ITEM-${orderId}-${idx + 1}`,
      sku: item.sku,
      itemName: item.itemName || skuObj?.name || item.sku,
      requestedQty: orderQty,
      orderQtyCtn: orderQty,
      allocateQty: allocQty,
      fulfillmentQty: 0,
      outstandingQty: orderQty,
      pickedQty: 0,
      isPicked: false,
      remark: item.remark || ''
    };
  });

  const isFullyAllocated = totalAllocatedCtn >= totalOrderCtn && totalOrderCtn > 0;
  const isPartiallyAllocated = totalAllocatedCtn > 0 && totalAllocatedCtn < totalOrderCtn;

  const newSalesOrder: PickOrder = {
    id: orderId,
    salesOrderNo: soNumber,
    poNumber: poNumber || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: customerName.trim(),
    orderDate: timestampStr,
    requiredDeliveryDate: requiredDeliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    status: isFullyAllocated ? 'PENDING' : 'PENDING',
    priority: priority || 'NORMAL',
    destinationZone: destinationZone || 'Outbound Express Bay 1',
    fulfillmentStatus: isFullyAllocated ? 'OUTSTANDING' : isPartiallyAllocated ? 'PARTIAL' : 'OUTSTANDING',
    totalOrderCtn,
    totalAllocatedCtn,
    totalFulfilledCtn: 0,
    totalOutstandingCtn: totalOrderCtn,
    remark: remark || 'New customer sales order created.',
    items: orderItems
  };

  ordersState.unshift(newSalesOrder);

  // Sync reserved stock across catalog
  syncReservedStockState();

  // Audit log
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_CREATED',
    targetEntity: soNumber,
    details: `Created Sales Order ${soNumber} for ${customerName} (${totalOrderCtn} CTN ordered, ${totalAllocatedCtn} CTN allocated/reserved).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: newSalesOrder,
    warnings,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// PUT /api/sales-orders/:id/allocation - Update allocation quantity & reserve stock
app.put('/api/sales-orders/:id/allocation', (req, res) => {
  const { id } = req.params;
  const { items, remark } = req.body;

  const orderIndex = ordersState.findIndex((o) => o.id === id || o.salesOrderNo === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const targetOrder = ordersState[orderIndex];
  if (targetOrder.isLocked) {
    return res.status(400).json({ error: `Sales Order ${id} is locked and marked DONE. Unlock it first to modify allocations.` });
  }
  const timestampStr = nowStamp();

  let totalOrderCtn = 0;
  let totalAllocatedCtn = 0;
  let totalFulfilledCtn = 0;

  if (Array.isArray(items)) {
    for (const updateItem of items) {
      for (const f of ['orderQtyCtn', 'requestedQty', 'allocateQty', 'fulfillmentQty']) {
        if (updateItem[f] !== undefined && (!Number.isFinite(Number(updateItem[f])) || Number(updateItem[f]) < 0)) {
          return res.status(400).json({ error: `${f} must be a number, 0 or more.` });
        }
      }
    }
    for (const updateItem of items) {
      const line = targetOrder.items.find((i) => i.sku === updateItem.sku || i.id === updateItem.id);
      if (line && updateItem.allocateQty !== undefined && Number(updateItem.allocateQty) > Number(line.allocateQty ?? 0)) {
        const extra = Number(updateItem.allocateQty) - Number(line.allocateQty ?? 0);
        const free = freeStockFor(line.sku, targetOrder.id) - Math.max(0, Number(line.allocateQty ?? 0) - itemFulfilled(line));
        if (extra > Math.max(0, free)) {
          return res.status(400).json({ error: `Cannot allocate ${updateItem.allocateQty} of ${line.sku}: only ${Math.max(0, Number(line.allocateQty ?? 0) + Math.max(0, free))} can be reserved from current stock.` });
        }
      }
    }
    items.forEach((updateItem: any) => {
      const lineItem = targetOrder.items.find((i) => i.sku === updateItem.sku || i.id === updateItem.id);
      if (lineItem) {
        if (updateItem.orderQtyCtn !== undefined) lineItem.orderQtyCtn = Number(updateItem.orderQtyCtn);
        if (updateItem.requestedQty !== undefined) lineItem.requestedQty = Number(updateItem.requestedQty);
        if (updateItem.allocateQty !== undefined) lineItem.allocateQty = Number(updateItem.allocateQty);
        if (updateItem.fulfillmentQty !== undefined) lineItem.fulfillmentQty = Number(updateItem.fulfillmentQty);
        if (updateItem.remark !== undefined) lineItem.remark = updateItem.remark;

        const orderQty = lineItem.orderQtyCtn ?? lineItem.requestedQty ?? 0;
        const fulQty = lineItem.fulfillmentQty ?? lineItem.pickedQty ?? 0;
        lineItem.outstandingQty = Math.max(0, orderQty - fulQty);
      }
    });
  }

  // Recalculate order totals
  targetOrder.items.forEach((item) => {
    const orderQty = item.orderQtyCtn ?? item.requestedQty ?? 0;
    const allocQty = item.allocateQty ?? 0;
    const fulQty = item.fulfillmentQty ?? item.pickedQty ?? 0;

    totalOrderCtn += orderQty;
    totalAllocatedCtn += allocQty;
    totalFulfilledCtn += fulQty;
  });

  targetOrder.totalOrderCtn = totalOrderCtn;
  targetOrder.totalAllocatedCtn = totalAllocatedCtn;
  targetOrder.totalFulfilledCtn = totalFulfilledCtn;
  targetOrder.totalOutstandingCtn = Math.max(0, totalOrderCtn - totalFulfilledCtn);

  if (remark) {
    targetOrder.remark = remark;
  }

  // Update order fulfillment status
  if (totalFulfilledCtn >= totalOrderCtn && totalOrderCtn > 0) {
    targetOrder.fulfillmentStatus = 'FULFILLED';
    targetOrder.status = 'DONE';
  } else if (totalAllocatedCtn >= totalOrderCtn && totalOrderCtn > 0) {
    targetOrder.fulfillmentStatus = 'OUTSTANDING';
    targetOrder.status = 'PENDING';
  } else {
    targetOrder.fulfillmentStatus = 'PARTIAL';
  }

  // Recalculate global reserved stock & batch allocations
  syncReservedStockState();

  // Audit log
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_ALLOCATION_UPDATED',
    targetEntity: targetOrder.salesOrderNo || targetOrder.id,
    details: `Updated allocation for Sales Order ${targetOrder.salesOrderNo || targetOrder.id}: ${totalAllocatedCtn} CTN allocated / reserved out of ${totalOrderCtn} CTN requested.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders/:id/auto-allocate - Auto FEFO Allocation (only what is really in stock)
app.post('/api/sales-orders/:id/auto-allocate', (req, res) => {
  const { id } = req.params;

  const targetOrder = ordersState.find((o) => o.id === id || o.salesOrderNo === id);
  if (!targetOrder) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }
  if (targetOrder.isLocked) {
    return res.status(400).json({ error: `Sales Order ${id} is locked. Unlock it first.` });
  }

  // Shippable stock per SKU, minus what other open orders have already reserved.
  const freeBySku = new Map<string, number>();
  const freeStock = (sku: string) => {
    if (!freeBySku.has(sku)) {
      const onHand = fefoBatches(sku).reduce((sum, b) => sum + b.quantityOnHand, 0);
      freeBySku.set(sku, Math.max(0, onHand - reservedByOthers(sku, targetOrder.id)));
    }
    return freeBySku.get(sku)!;
  };

  const shortages: string[] = [];
  targetOrder.items.forEach((item) => {
    const fulfilled = itemFulfilled(item);
    const stillNeeded = Math.max(0, itemRequested(item) - fulfilled);
    const give = Math.min(stillNeeded, freeStock(item.sku));
    freeBySku.set(item.sku, freeStock(item.sku) - give);
    item.allocateQty = fulfilled + give;
    if (give < stillNeeded) shortages.push(`${item.sku}: short by ${stillNeeded - give}`);
  });

  recalcOrderTotals(targetOrder);
  targetOrder.fulfillmentStatus = shortages.length ? 'PARTIAL' : 'OUTSTANDING';

  // Re-sync reserved stock across system
  syncReservedStockState();

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Automated Allocation Engine',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: shortages.length ? 'AUTO_ALLOCATE_PARTIAL' : 'AUTO_ALLOCATE_SUCCESS',
    targetEntity: targetOrder.salesOrderNo || targetOrder.id,
    details: `Auto-allocated FEFO stock for Sales Order ${targetOrder.salesOrderNo || targetOrder.id}. Total allocated: ${targetOrder.totalAllocatedCtn} of ${targetOrder.totalOrderCtn} CTN.${shortages.length ? ' Not enough stock: ' + shortages.join('; ') + '.' : ''}`,
    severity: shortages.length ? 'WARNING' : 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    shortages,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// DELETE /api/sales-orders/:id - Delete or Cancel Sales Order
app.delete('/api/sales-orders/:id', (req, res) => {
  const { id } = req.params;

  const orderIndex = ordersState.findIndex((o) => o.id === id || o.salesOrderNo === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const deletedOrder = ordersState[orderIndex];
  if (deletedOrder.isLocked) {
    return res.status(400).json({ error: `Sales Order ${id} is locked and marked DONE. Unlock it first if you wish to delete it.` });
  }
  ordersState.splice(orderIndex, 1);

  // Sync reserved stock state
  syncReservedStockState();

  const timestampStr = nowStamp();
  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_DELETED',
    targetEntity: deletedOrder.salesOrderNo || deletedOrder.id,
    details: `Deleted Sales Order ${deletedOrder.salesOrderNo || deletedOrder.id} and released reserved stock allocation.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    deletedId: id,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders/:id/lock - Lock or unlock a Sales Order
//   Locking marks the order FULFILLED. Any quantity not yet picked is taken out of stock
//   (earliest best-before first). If there is not enough stock the lock is refused, unless
//   the caller sends { forceWithoutStock: true } to lock without touching stock.
app.post('/api/sales-orders/:id/lock', (req, res) => {
  const { id } = req.params;
  const { isLocked, forceWithoutStock } = req.body;

  const targetOrder = ordersState.find((o) => o.id === id || o.salesOrderNo === id);
  if (!targetOrder) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const shouldLock = isLocked !== undefined ? Boolean(isLocked) : !targetOrder.isLocked;
  const timestampStr = nowStamp();
  const orderRef = targetOrder.salesOrderNo || targetOrder.id;
  const deductions: Array<{ batch: Batch; qty: number; item: (typeof targetOrder.items)[number] }> = [];

  if (shouldLock && !targetOrder.isLocked && !forceWithoutStock) {
    // Work out the stock that still has to leave the warehouse, and check it exists.
    const used = new Map<Batch, number>();
    const missing: string[] = [];
    for (const item of targetOrder.items) {
      let need = Math.max(0, itemRequested(item) - itemFulfilled(item));
      for (const b of fefoBatches(item.sku)) {
        if (need <= 0) break;
        const free = b.quantityOnHand - (used.get(b) || 0);
        if (free <= 0) continue;
        const take = Math.min(free, need);
        used.set(b, (used.get(b) || 0) + take);
        deductions.push({ batch: b, qty: take, item });
        need -= take;
      }
      if (need > 0 && allowNegativeStock) {
        // Negative stock allowed: the shortfall is taken from the last batch used, or the earliest usable batch.
        const lastForItem = [...deductions].reverse().find((d) => d.item === item);
        const target =
          lastForItem?.batch ||
          batchesState
            .filter((b) => b.sku === item.sku && b.status === 'ACTIVE' && !isExpired(b.bestBeforeDate))
            .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime())[0];
        if (target) {
          deductions.push({ batch: target, qty: need, item });
          need = 0;
        }
      }
      if (need > 0) missing.push(`${item.sku} (short by ${need})`);
    }
    if (missing.length) {
      return res.status(400).json({
        error: `Cannot lock ${orderRef}: not enough shippable stock for ${missing.join(', ')}. Receive or adjust stock first.`
      });
    }
  }

  targetOrder.isLocked = shouldLock;

  if (shouldLock) {
    targetOrder.status = 'DONE';
    targetOrder.fulfillmentStatus = 'FULFILLED';
    targetOrder.lockedAt = timestampStr;
    targetOrder.lockedBy = (req as any).user?.name;

    // Take the remaining quantity out of stock and log it.
    deductions.forEach(({ batch, qty, item }) => {
      batch.quantityOnHand -= qty;
      batch.quantityAvailable = Math.max(0, batch.quantityOnHand - batch.quantityAllocated);
      stockMovementsState.unshift(
        newMovement({
          type: 'DISPATCH',
          sku: batch.sku,
          itemName: batch.itemName,
          batchNo: batch.batchNo,
          fromLocation: batch.locationId,
          toLocation: targetOrder.destinationZone,
          quantity: qty,
          operator: (req as any).user?.name || 'System',
          referenceDoc: orderRef
        })
      );
      item.fulfillmentQty = itemFulfilled(item) + qty;
    });

    // Mark every line fulfilled.
    targetOrder.items.forEach((item) => {
      const requested = itemRequested(item);
      if (itemFulfilled(item) < requested) item.fulfillmentQty = requested; // only when forced without stock
      item.pickedQty = itemFulfilled(item);
      item.outstandingQty = 0;
      item.isPicked = true;
    });
    recalcOrderTotals(targetOrder);
    targetOrder.totalOutstandingCtn = 0;
  }

  syncReservedStockState();

  const auditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: shouldLock ? 'SALES_ORDER_LOCKED' : 'SALES_ORDER_UNLOCKED',
    targetEntity: orderRef,
    details: shouldLock
      ? `Locked Sales Order ${orderRef} as FULFILLED and DONE.${
          deductions.length
            ? ' Stock taken out: ' + deductions.map((d) => `${d.batch.batchNo} x${d.qty}`).join(', ') + '.'
            : forceWithoutStock
            ? ' Locked WITHOUT changing stock (forced).'
            : ''
        }`
      : `Unlocked Sales Order ${orderRef} for edits.`,
    severity: shouldLock && forceWithoutStock ? 'WARNING' : 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/orders/optimize-route - Calculate optimized picking route
app.post('/api/orders/optimize-route', (req, res) => {
  const { orderId } = req.body;
  const order = ordersState.find((o) => o.id === orderId || o.salesOrderNo === orderId);

  if (!order) {
    return res.status(404).json({ error: `Order ${orderId} not found.` });
  }
  if (order.status === 'COMPLETED' || order.status === 'DONE' || order.status === 'CANCELLED') {
    return res.status(400).json({ error: `Order ${order.salesOrderNo || order.id} is ${order.status}; there is nothing left to pick.` });
  }

  const route = calculateOptimizedPickRoute(order, batchesState, locationsState);
  if (order.status === 'PENDING') order.status = 'OPTIMIZED';

  res.json({ order, route });
});

// POST /api/orders/complete-pick - Record what was picked and deduct it from the batches
//   body: { orderId, pickedItems: [{ batchNo, qty, sku? }] }
//   Safe to retry: a finished order cannot be picked twice, and nothing is changed unless
//   every line in the request is valid.
app.post('/api/orders/complete-pick', (req, res) => {
  const { orderId, pickedItems } = req.body;

  const order = ordersState.find((o) => o.id === orderId || o.salesOrderNo === orderId);
  if (!order) {
    return res.status(404).json({ error: `Order ${orderId} not found.` });
  }
  if (order.status === 'COMPLETED' || order.status === 'DONE' || order.isLocked) {
    return res.status(400).json({ error: `Order ${order.salesOrderNo || order.id} is already ${order.status}. Nothing was picked twice.` });
  }
  if (order.status === 'CANCELLED') {
    return res.status(400).json({ error: `Order ${order.salesOrderNo || order.id} is cancelled.` });
  }
  if (!Array.isArray(pickedItems) || pickedItems.length === 0) {
    return res.status(400).json({ error: 'pickedItems is required (batchNo and qty for each pick).' });
  }

  // ---- 1) validate everything first -------------------------------------------------
  const orderSkus = new Set(order.items.map((i) => i.sku));
  const resolved: Array<{ batch: Batch; qty: number }> = [];
  const perBatchTotal = new Map<Batch, number>();
  const perSkuTotal = new Map<string, number>();

  for (const picked of pickedItems) {
    const { batchNo, qty, sku } = picked || {};
    if (!batchNo || !isPositive(qty)) {
      return res.status(400).json({ error: 'Each pick needs a batchNo and a quantity greater than 0.' });
    }
    const q = Number(qty);
    const candidates = batchesState.filter((b) => b.batchNo === batchNo && (sku ? b.sku === sku : orderSkus.has(b.sku)));
    if (candidates.length === 0) {
      return res.status(404).json({ error: `Batch ${batchNo} not found for this order's products.` });
    }
    if (candidates.length > 1) {
      return res.status(400).json({ error: `Batch ${batchNo} matches more than one product. Include the sku with each pick.` });
    }
    const batch = candidates[0];
    if (!orderSkus.has(batch.sku)) {
      return res.status(400).json({ error: `Batch ${batchNo} (${batch.sku}) is not part of this order.` });
    }
    if (batch.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Batch ${batchNo} is ${batch.status} and cannot be picked.` });
    }
    const totalFromBatch = (perBatchTotal.get(batch) || 0) + q;
    if (totalFromBatch > batch.quantityOnHand && !allowNegativeStock) {
      return res.status(400).json({ error: `Batch ${batchNo} only has ${batch.quantityOnHand} on hand; ${totalFromBatch} was picked.` });
    }
    perBatchTotal.set(batch, totalFromBatch);
    perSkuTotal.set(batch.sku, (perSkuTotal.get(batch.sku) || 0) + q);
    resolved.push({ batch, qty: q });
  }

  for (const [sku, picked] of perSkuTotal) {
    const outstanding = order.items
      .filter((i) => i.sku === sku)
      .reduce((sum, i) => sum + Math.max(0, itemRequested(i) - itemFulfilled(i)), 0);
    if (picked > outstanding) {
      return res.status(400).json({ error: `Picked ${picked} of ${sku} but the order only still needs ${outstanding}.` });
    }
  }

  // ---- 2) apply ---------------------------------------------------------------------
  resolved.forEach(({ batch, qty }) => {
    batch.quantityOnHand -= qty;
    batch.quantityAvailable = Math.max(0, batch.quantityOnHand - batch.quantityAllocated);
    stockMovementsState.unshift(
      newMovement({
        type: 'PICKING',
        sku: batch.sku,
        itemName: batch.itemName,
        batchNo: batch.batchNo,
        fromLocation: batch.locationId,
        toLocation: order.destinationZone,
        quantity: qty,
        operator: (req as any).user?.name || 'Floor Picker (Guided Route)',
        referenceDoc: order.id
      })
    );
  });

  // Credit each order line (a SKU can appear on several lines: fill them in order).
  const creditLeft = new Map(perSkuTotal);
  order.items.forEach((item) => {
    let left = creditLeft.get(item.sku) || 0;
    if (left <= 0) return;
    const give = Math.min(left, Math.max(0, itemRequested(item) - itemFulfilled(item)));
    item.fulfillmentQty = itemFulfilled(item) + give;
    creditLeft.set(item.sku, left - give);
  });
  order.items.forEach((item) => {
    item.pickedQty = itemFulfilled(item);
    item.outstandingQty = Math.max(0, itemRequested(item) - itemFulfilled(item));
    item.isPicked = item.outstandingQty === 0;
  });
  recalcOrderTotals(order);

  const allDone = order.items.every((i) => (i.outstandingQty || 0) === 0);
  order.status = allDone ? 'COMPLETED' : 'IN_PROGRESS';
  order.fulfillmentStatus = allDone ? 'FULFILLED' : 'PARTIAL';

  syncInventoryAndMatrixState();

  res.json({ success: true, order, completed: allDone, outstandingCtn: order.totalOutstandingCtn });
});

// GET /api/audit-logs - Retrieve administrative audit logs
app.get('/api/audit-logs', (req, res) => {
  res.json(auditLogsState);
});

// POST /api/audit-logs - Create a new administrative audit log entry
app.post('/api/audit-logs', (req, res) => {
  const { actionCategory, actionType, targetEntity, details, severity } = req.body;
  const me = (req as any).user as StoredUser;

  if (!actionCategory || !actionType || !details) {
    return res.status(400).json({ error: 'Missing required audit log parameters.' });
  }

  const newAuditEntry: AuditLogEntry = {
    id: `AUD-${uid()}`,
    timestamp: nowStamp(),
    userId: me.id,
    userName: me.name,
    userRole: me.role,
    actionCategory: actionCategory || 'SYSTEM',
    actionType,
    targetEntity: targetEntity || 'System',
    details,
    severity: severity || 'INFO',
    ipAddress: String(req.ip || '').replace('::ffff:', '')
  };

  auditLogsState.unshift(newAuditEntry);
  res.json({ success: true, auditLog: newAuditEntry });
});

// ==========================================
// MS SQL SERVER DATABASE EMULATOR & T-SQL ROUTE
// ==========================================

// GET /api/mssql/ping - Real database connectivity check
app.get('/api/mssql/ping', async (req, res) => {
  const serverHost = process.env.MSSQL_SERVER || (process.env.WMS_STORE === 'memory' ? 'memory' : 'localhost');
  const port = process.env.MSSQL_PORT || '1433';

  if (mssqlSimulateOffline) {
    return res.status(503).json({
      connected: false,
      status: 'disconnected',
      error: `Simulated outage: pretending SQL Server on ${serverHost}:${port} is unreachable.`,
      databaseName: process.env.MSSQL_DATABASE || 'ApexWMS',
      serverHost,
      port,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const info = await store.ping();
    res.json({
      connected: true,
      status: 'connected',
      databaseName: info.databaseName,
      serverVersion: info.serverVersion,
      serverHost,
      port,
      latencyMs: info.latencyMs,
      activeConnections: 0,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      connected: false,
      status: 'disconnected',
      error: `Cannot reach SQL Server on ${serverHost}:${port}: ${err?.message || err}`,
      databaseName: process.env.MSSQL_DATABASE || 'ApexWMS',
      serverHost,
      port,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/mssql/toggle-simulate-offline - Toggle offline simulation for QA testing
app.post('/api/mssql/toggle-simulate-offline', (req, res) => {
  mssqlSimulateOffline = !mssqlSimulateOffline;
  res.json({
    simulateOffline: mssqlSimulateOffline,
    message: mssqlSimulateOffline
      ? 'Simulated MS SQL Server disconnection activated.'
      : 'MS SQL Server connection restored to normal online state.'
  });
});

app.get('/api/mssql/schema', (req, res) => {
  res.json({
    tables: INITIAL_MSSQL_SCHEMA,
    serverVersion: 'Microsoft SQL Server 2022 (RTM) - 16.0.1000.6 (X64)',
    databaseName: 'ApexWMS_Production'
  });
});

// POST /api/mssql/query - Process T-SQL Queries
app.post('/api/mssql/query', (req, res) => {
  const { sql } = req.body;
  const startTime = Date.now();

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'SQL query string required.' });
  }

  const normalizedSql = sql.trim();

  try {
    let columns: string[] = [];
    let rows: Record<string, any>[] = [];

    // T-SQL Query Parser & Execution against in-memory state
    if (/SELECT.*FROM dbo\.AuditLogs/i.test(normalizedSql)) {
      columns = ['AuditID', 'Timestamp', 'UserID', 'UserName', 'UserRole', 'ActionCategory', 'ActionType', 'TargetEntity', 'Details', 'Severity'];
      rows = auditLogsState.map((a) => ({
        AuditID: a.id,
        Timestamp: a.timestamp,
        UserID: a.userId,
        UserName: a.userName,
        UserRole: a.userRole,
        ActionCategory: a.actionCategory,
        ActionType: a.actionType,
        TargetEntity: a.targetEntity,
        Details: a.details,
        Severity: a.severity
      }));

      if (/WHERE.*ActionCategory.*QUARANTINE/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.ActionCategory === 'QUARANTINE');
      } else if (/WHERE.*ActionCategory.*ROLE_MANAGEMENT/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.ActionCategory === 'ROLE_MANAGEMENT');
      }
    } else if (/SELECT.*FROM dbo\.Batches/i.test(normalizedSql)) {
      columns = ['BatchID', 'BatchNo', 'SKU', 'ItemName', 'BestBeforeDate', 'Supplier', 'LocationID', 'QuantityOnHand', 'Status'];
      rows = batchesState.map((b) => ({
        BatchID: b.id,
        BatchNo: b.batchNo,
        SKU: b.sku,
        ItemName: b.itemName,
        BestBeforeDate: b.bestBeforeDate,
        Supplier: b.supplier,
        LocationID: b.locationId,
        QuantityOnHand: b.quantityOnHand,
        Status: b.status
      }));

      // Filter by WHERE clauses
      if (/WHERE.*Status.*QUARANTINED/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.Status === 'QUARANTINED');
      } else if (/WHERE.*BestBeforeDate/i.test(normalizedSql)) {
        // Expiry filter
        rows = rows.filter((r) => String(r.BestBeforeDate).slice(0, 10) < todayStr());
      }
    } else if (/SELECT.*FROM dbo\.Inventory/i.test(normalizedSql)) {
      columns = ['SKU', 'ItemName', 'Category', 'Unit', 'ReorderPoint', 'SafetyStock', 'WeightPerUnitKg', 'StorageZone'];
      rows = skusState.map((s) => ({
        SKU: s.sku,
        ItemName: s.name,
        Category: s.category,
        Unit: s.unit,
        ReorderPoint: s.reorderPoint,
        SafetyStock: s.safetyStock,
        WeightPerUnitKg: s.weightPerUnitKg,
        StorageZone: s.storageZone
      }));
    } else if (/SELECT.*FROM dbo\.Locations/i.test(normalizedSql)) {
      columns = ['LocationID', 'Aisle', 'RackNumber', 'ShelfLevel', 'Zone', 'CapacityKg', 'CurrentKg'];
      rows = locationsState.map((l) => ({
        LocationID: l.id,
        Aisle: l.aisle,
        RackNumber: l.rack,
        ShelfLevel: l.shelf,
        Zone: l.zone,
        CapacityKg: l.capacityKg,
        CurrentKg: l.currentKg
      }));
    } else if (/SELECT.*FROM dbo\.StockMovements/i.test(normalizedSql)) {
      columns = ['MovementID', 'Timestamp', 'MovementType', 'SKU', 'ItemName', 'BatchNo', 'FromLocation', 'ToLocation', 'Quantity', 'Operator'];
      rows = stockMovementsState.map((m) => ({
        MovementID: m.id,
        Timestamp: m.timestamp,
        MovementType: m.type,
        SKU: m.sku,
        ItemName: m.itemName,
        BatchNo: m.batchNo,
        FromLocation: m.fromLocation || 'N/A',
        ToLocation: m.toLocation || 'N/A',
        Quantity: m.quantity,
        Operator: m.operator
      }));
    } else if (/JOIN|GROUP BY|FEFO/i.test(normalizedSql)) {
      // Complex FEFO Traceability Join
      columns = ['BatchNo', 'SKU', 'ItemName', 'BestBeforeDate', 'LocationID', 'Aisle', 'QuantityOnHand', 'DaysUntilExpiry', 'FEFO_Priority'];
      const now = new Date().getTime();
      rows = batchesState.map((b) => {
        const loc = locationsState.find((l) => l.id === b.locationId);
        const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - now) / (1000 * 3600 * 24));
        return {
          BatchNo: b.batchNo,
          SKU: b.sku,
          ItemName: b.itemName,
          BestBeforeDate: b.bestBeforeDate,
          LocationID: b.locationId,
          Aisle: loc ? loc.aisle : 'A',
          QuantityOnHand: b.quantityOnHand,
          DaysUntilExpiry: days,
          FEFO_Priority: days <= 14 ? 'HIGH - EXPIRE SOON' : 'NORMAL'
        };
      }).sort((a, b) => a.DaysUntilExpiry - b.DaysUntilExpiry);
    } else {
      // Default fallback return query overview
      columns = ['QueryStatus', 'ServerEngine', 'ProcessedStatement'];
      rows = [
        {
          QueryStatus: 'SUCCESS',
          ServerEngine: 'MS SQL Server 2022 Express Edition (ApexWMS Cluster)',
          ProcessedStatement: normalizedSql.slice(0, 100) + '...'
        }
      ];
    }

    const executionTimeMs = Date.now() - startTime + Math.floor(Math.random() * 8 + 3);

    res.json({
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
      sqlQuery: normalizedSql
    });
  } catch (err: any) {
    res.status(500).json({
      error: `MS SQL Exception: ${err.message || 'Syntax error in T-SQL query'}`
    });
  }
});

// ==========================================
// GEMINI AI INTEGRATION ROUTES
// ==========================================

// POST /api/gemini/sql-assistant - NL to T-SQL Query Generator & WMS Assistant
app.post('/api/gemini/sql-assistant', async (req, res) => {
  try {
    const { userPrompt } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Please configure GEMINI_API_KEY in Secrets.'
      });
    }

    const systemInstruction = `You are an expert MS SQL Server DBA and Warehouse Management System (WMS) specialist.
The MS SQL Database 'ApexWMS_Production' has the following schema:
- dbo.Inventory (SKU, ItemName, Category, Unit, ReorderPoint, SafetyStock, WeightPerUnitKg, Barcode, StorageZone)
- dbo.Batches (BatchID, BatchNo, SKU, ManufactureDate, BestBeforeDate, Supplier, LocationID, QuantityOnHand, QuantityAllocated, QuantityAvailable, Status, ReceivedAt)
- dbo.Locations (LocationID, Aisle, RackNumber, ShelfLevel, Zone, CapacityKg, CurrentKg)
- dbo.PickOrders (OrderID, CustomerName, OrderDate, RequiredDeliveryDate, Status, Priority, DestinationZone)
- dbo.StockMovements (MovementID, Timestamp, MovementType, SKU, BatchNo, FromLocation, ToLocation, Quantity, Operator, ReferenceDoc)

When asked to generate a query or report, output:
1. A clean T-SQL query block (e.g. \`\`\`sql ... \`\`\`)
2. A brief 2-sentence explanation of how this query resolves FEFO traceability, inventory status, or route optimization.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.3
      }
    });

    res.json({ answer: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini request failed' });
  }
});

// POST /api/gemini/inventory-insights - Smart Expiry & Route Advisory
app.post('/api/gemini/inventory-insights', async (req, res) => {
  try {
    const ai = getGenAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Configure GEMINI_API_KEY in Secrets.'
      });
    }

    const summaryText = `Current WMS Inventory State:
Total SKUs: ${skusState.length}
Total Batches: ${batchesState.length}
Batches Expiring in < 30 days: ${batchesState.filter(b => {
      const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - Date.now()) / (1000 * 3600 * 24));
      return days <= 30;
    }).map(b => `${b.batchNo} (${b.itemName}, BBD: ${b.bestBeforeDate}, Loc: ${b.locationId})`).join('; ')}

Quarantined Lots: ${batchesState.filter(b => b.status === 'QUARANTINED').map(b => `${b.batchNo} (${b.itemName})`).join(', ') || 'None'}
`;

    const prompt = `${summaryText}

Analyze this warehouse inventory state and provide 3 actionable, high-impact operational recommendations for:
1. FEFO Expiry Risk & Spoilage Prevention
2. Picking Route & Location Slotting Efficiency
3. Lot Quality Control & Traceability Safeguards.

Keep the advice concise, professional, and formatted in clean bullet points with emoji headings.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.4
      }
    });

    res.json({ insights: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini insight call failed' });
  }
});

// ==========================================
// VITE MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  await initialize();

  // Test-only switch (never enabled in production): make the next database write fail,
  // to prove that a failed write leaves nothing half-saved.
  if (process.env.WMS_TEST_HOOKS === '1' && store instanceof MemoryStore) {
    app.post('/api/_test/fail-next-write', (req, res) => {
      (store as MemoryStore).failNextApply = true;
      res.json({ ok: true });
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '1d',
        etag: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          }
        }
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) res.status(404).send('ApexWMS service is running. Use the desktop app to connect.');
      });
    });
  }

  // Errors from the API handlers (must come after the routes).
  app.use(((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[WMS] Unhandled error:', err?.stack || err);
    if (!res.headersSent) res.status(err?.status || 500).json({ error: err?.message || 'Server error' });
  }) as any);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApexWMS service running on port ${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      try {
        await store.close();
      } catch {
        /* ignore */
      }
      console.log('HTTP server closed. Process exiting.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forceful shutdown timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[WMS] Could not start:', err?.message || err);
  process.exit(1);
});
