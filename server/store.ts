/**
 * Persistence layer.
 *
 * The API handlers work on plain in-memory arrays (fast, simple logic). After every
 * request that changes data, `Persistence.commit()` writes ONLY the rows that changed
 * to the database inside ONE transaction. If that write fails, the in-memory state is
 * reloaded from the database, so memory and database never drift apart.
 *
 * Two stores implement the same interface:
 *   - SqlServerStore  -> real Microsoft SQL Server (production)
 *   - MemoryStore     -> in-process, used by the automated tests
 */
import sql from 'mssql';

// ---------------------------------------------------------------------------
// Collection definitions: table name, primary key, and the columns that are
// also stored as real SQL columns (so you can query them from Excel / Power BI /
// SSMS). The full record is always kept in the [Data] JSON column.
// ---------------------------------------------------------------------------
export interface ColumnSpec {
  name: string;
  type: string; // SQL type, e.g. NVARCHAR(100)
  get: (row: any) => string | number | null;
}

export interface CollectionSpec {
  table: string;
  id: (row: any) => string;
  cols: ColumnSpec[];
}

const s = (v: any, n = 4000) => (v === undefined || v === null ? null : String(v).slice(0, n));
const n = (v: any) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));

export const COLLECTIONS = {
  skus: {
    table: 'Skus',
    id: (r) => r.sku,
    cols: [
      { name: 'Name', type: 'NVARCHAR(300)', get: (r) => s(r.name, 300) },
      { name: 'Category', type: 'NVARCHAR(200)', get: (r) => s(r.category, 200) },
      { name: 'Barcode', type: 'NVARCHAR(100)', get: (r) => s(r.barcode, 100) }
    ]
  },
  locations: {
    table: 'Locations',
    id: (r) => r.id,
    cols: [
      { name: 'Aisle', type: 'NVARCHAR(20)', get: (r) => s(r.aisle, 20) },
      { name: 'Zone', type: 'NVARCHAR(100)', get: (r) => s(r.zone, 100) }
    ]
  },
  batches: {
    table: 'Batches',
    id: (r) => r.id,
    cols: [
      { name: 'BatchNo', type: 'NVARCHAR(100)', get: (r) => s(r.batchNo, 100) },
      { name: 'Sku', type: 'NVARCHAR(100)', get: (r) => s(r.sku, 100) },
      { name: 'BestBeforeDate', type: 'NVARCHAR(30)', get: (r) => s(r.bestBeforeDate, 30) },
      { name: 'LocationId', type: 'NVARCHAR(100)', get: (r) => s(r.locationId, 100) },
      { name: 'QuantityOnHand', type: 'FLOAT', get: (r) => n(r.quantityOnHand) },
      { name: 'Status', type: 'NVARCHAR(30)', get: (r) => s(r.status, 30) }
    ]
  },
  orders: {
    table: 'SalesOrders',
    id: (r) => r.id,
    cols: [
      { name: 'SalesOrderNo', type: 'NVARCHAR(100)', get: (r) => s(r.salesOrderNo, 100) },
      { name: 'CustomerName', type: 'NVARCHAR(300)', get: (r) => s(r.customerName, 300) },
      { name: 'Status', type: 'NVARCHAR(30)', get: (r) => s(r.status, 30) },
      { name: 'OrderDate', type: 'NVARCHAR(30)', get: (r) => s(r.orderDate, 30) }
    ]
  },
  stockMovements: {
    table: 'StockMovements',
    id: (r) => r.id,
    cols: [
      { name: 'Timestamp', type: 'NVARCHAR(30)', get: (r) => s(r.timestamp, 30) },
      { name: 'MovementType', type: 'NVARCHAR(40)', get: (r) => s(r.type, 40) },
      { name: 'Sku', type: 'NVARCHAR(100)', get: (r) => s(r.sku, 100) },
      { name: 'BatchNo', type: 'NVARCHAR(100)', get: (r) => s(r.batchNo, 100) },
      { name: 'Quantity', type: 'FLOAT', get: (r) => n(r.quantity) },
      { name: 'Operator', type: 'NVARCHAR(200)', get: (r) => s(r.operator, 200) }
    ]
  },
  auditLogs: {
    table: 'AuditLogs',
    id: (r) => r.id,
    cols: [
      { name: 'Timestamp', type: 'NVARCHAR(30)', get: (r) => s(r.timestamp, 30) },
      { name: 'UserName', type: 'NVARCHAR(200)', get: (r) => s(r.userName, 200) },
      { name: 'ActionType', type: 'NVARCHAR(100)', get: (r) => s(r.actionType, 100) },
      { name: 'Severity', type: 'NVARCHAR(20)', get: (r) => s(r.severity, 20) }
    ]
  },
  purchaseOrders: {
    table: 'PurchaseOrders',
    id: (r) => r.id,
    cols: [
      { name: 'Sku', type: 'NVARCHAR(100)', get: (r) => s(r.sku, 100) },
      { name: 'Supplier', type: 'NVARCHAR(300)', get: (r) => s(r.supplier, 300) },
      { name: 'Status', type: 'NVARCHAR(30)', get: (r) => s(r.status, 30) }
    ]
  },
  users: {
    table: 'Users',
    id: (r) => r.id,
    cols: [
      { name: 'Email', type: 'NVARCHAR(300)', get: (r) => s(r.email, 300) },
      { name: 'Name', type: 'NVARCHAR(200)', get: (r) => s(r.name, 200) },
      { name: 'Role', type: 'NVARCHAR(40)', get: (r) => s(r.role, 40) }
    ]
  },
  customers: {
    table: 'Customers',
    id: (r) => r.id,
    cols: [
      { name: 'CustomerCode', type: 'NVARCHAR(100)', get: (r) => s(r.customerCode, 100) },
      { name: 'CompanyName', type: 'NVARCHAR(300)', get: (r) => s(r.companyName, 300) }
    ]
  },
  facilities: {
    table: 'Facilities',
    id: (r) => r.id,
    cols: [{ name: 'Name', type: 'NVARCHAR(300)', get: (r) => s(r.name, 300) }]
  },
  zones: {
    table: 'Zones',
    id: (r) => r.code,
    cols: [{ name: 'Title', type: 'NVARCHAR(300)', get: (r) => s(r.title, 300) }]
  }
} satisfies Record<string, CollectionSpec>;

export type CollectionName = keyof typeof COLLECTIONS;
export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------
export interface StoredRow {
  id: string;
  seq: number;
  cols: Record<string, string | number | null>;
  data: string; // JSON
}

export interface CollectionChanges {
  upserts: StoredRow[];
  deletes: string[];
}

export interface Store {
  init(): Promise<void>;
  /** Rows of one collection ordered by seq ascending. */
  load(collection: CollectionName): Promise<StoredRow[]>;
  getMeta(key: string): Promise<string | null>;
  /** Apply all changes + meta updates atomically (all or nothing). */
  apply(changes: Partial<Record<CollectionName, CollectionChanges>>, meta: Record<string, string>): Promise<void>;
  ping(): Promise<{ latencyMs: number; serverVersion: string; databaseName: string }>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Microsoft SQL Server
// ---------------------------------------------------------------------------
export interface SqlServerConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  instanceName?: string;
}

export function sqlConfigFromEnv(env: NodeJS.ProcessEnv): SqlServerConfig {
  return {
    server: env.MSSQL_SERVER || 'localhost',
    port: Number(env.MSSQL_PORT || 1433),
    database: env.MSSQL_DATABASE || 'ApexWMS',
    user: env.MSSQL_USER || '',
    password: env.MSSQL_PASSWORD || '',
    encrypt: (env.MSSQL_ENCRYPT || 'false').toLowerCase() === 'true',
    // A SQL Server on your own office PC normally uses a self-signed certificate.
    trustServerCertificate: (env.MSSQL_TRUST_SERVER_CERT || 'true').toLowerCase() === 'true',
    instanceName: env.MSSQL_INSTANCE || undefined
  };
}

export class SqlServerStore implements Store {
  private pool!: sql.ConnectionPool;
  constructor(private cfg: SqlServerConfig) {}

  async init() {
    const options: sql.config['options'] = {
      encrypt: this.cfg.encrypt,
      trustServerCertificate: this.cfg.trustServerCertificate
    };
    if (this.cfg.instanceName) options.instanceName = this.cfg.instanceName;
    const config: sql.config = {
      server: this.cfg.server,
      database: this.cfg.database,
      user: this.cfg.user,
      password: this.cfg.password,
      options,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 30000,
      connectionTimeout: 15000
    };
    // With a named instance the port must be left out (SQL Browser resolves it).
    if (!this.cfg.instanceName) config.port = this.cfg.port;
    this.pool = await new sql.ConnectionPool(config).connect();
    this.pool.on('error', (err) => console.error('[sql] pool error:', err.message));
    await this.ensureSchema();
  }

  private async ensureSchema() {
    const pool = this.pool;
    await pool.request().batch(`
      IF OBJECT_ID(N'dbo.Meta', N'U') IS NULL
        CREATE TABLE dbo.Meta ([K] NVARCHAR(100) NOT NULL PRIMARY KEY, [V] NVARCHAR(MAX) NULL);
    `);
    for (const name of COLLECTION_NAMES) {
      const spec: CollectionSpec = COLLECTIONS[name];
      const extra = spec.cols.map((c) => `, [${c.name}] ${c.type} NULL`).join('');
      await pool.request().batch(`
        IF OBJECT_ID(N'dbo.${spec.table}', N'U') IS NULL
          CREATE TABLE dbo.${spec.table} (
            [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
            [Seq] BIGINT NOT NULL${extra},
            [Data] NVARCHAR(MAX) NOT NULL,
            [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
      `);
      await pool.request().batch(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_${spec.table}_Seq' AND object_id = OBJECT_ID(N'dbo.${spec.table}'))
          CREATE INDEX IX_${spec.table}_Seq ON dbo.${spec.table} ([Seq]);
      `);
    }
  }

  async load(collection: CollectionName): Promise<StoredRow[]> {
    const spec: CollectionSpec = COLLECTIONS[collection];
    const res = await this.pool
      .request()
      .query(`SELECT [Id], [Seq], [Data] FROM dbo.${spec.table} ORDER BY [Seq] ASC`);
    return res.recordset.map((r: any) => ({
      id: r.Id,
      seq: Number(r.Seq),
      cols: {},
      data: r.Data
    }));
  }

  async getMeta(key: string): Promise<string | null> {
    const res = await this.pool.request().input('k', sql.NVarChar(100), key).query('SELECT [V] FROM dbo.Meta WHERE [K] = @k');
    return res.recordset.length ? res.recordset[0].V : null;
  }

  async apply(changes: Partial<Record<CollectionName, CollectionChanges>>, meta: Record<string, string>) {
    const tx = new sql.Transaction(this.pool);
    await tx.begin();
    try {
      for (const name of Object.keys(changes) as CollectionName[]) {
        const spec: CollectionSpec = COLLECTIONS[name];
        const ch = changes[name]!;

        for (const id of ch.deletes) {
          await new sql.Request(tx).input('id', sql.NVarChar(100), id).query(`DELETE FROM dbo.${spec.table} WHERE [Id] = @id`);
        }

        for (const row of ch.upserts) {
          const req = new sql.Request(tx);
          req.input('id', sql.NVarChar(100), row.id);
          req.input('seq', sql.BigInt, row.seq);
          req.input('data', sql.NVarChar(sql.MAX), row.data);
          spec.cols.forEach((c, i) => {
            const v = row.cols[c.name];
            if (c.type === 'FLOAT') req.input(`c${i}`, sql.Float, v as number | null);
            else req.input(`c${i}`, sql.NVarChar(sql.MAX), v === null ? null : String(v));
          });
          const setList = spec.cols.map((c, i) => `[${c.name}] = @c${i}`).join(', ');
          const colList = spec.cols.map((c) => `[${c.name}]`).join(', ');
          const valList = spec.cols.map((_, i) => `@c${i}`).join(', ');
          await req.query(`
            UPDATE dbo.${spec.table}
               SET [Seq] = @seq, [Data] = @data, [UpdatedAt] = SYSUTCDATETIME()${setList ? ', ' + setList : ''}
             WHERE [Id] = @id;
            IF @@ROWCOUNT = 0
              INSERT INTO dbo.${spec.table} ([Id], [Seq], [Data]${colList ? ', ' + colList : ''})
              VALUES (@id, @seq, @data${valList ? ', ' + valList : ''});
          `);
        }
      }

      for (const [k, v] of Object.entries(meta)) {
        await new sql.Request(tx)
          .input('k', sql.NVarChar(100), k)
          .input('v', sql.NVarChar(sql.MAX), v)
          .query(`
            UPDATE dbo.Meta SET [V] = @v WHERE [K] = @k;
            IF @@ROWCOUNT = 0 INSERT INTO dbo.Meta ([K], [V]) VALUES (@k, @v);
          `);
      }

      await tx.commit();
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* already rolled back */
      }
      throw err;
    }
  }

  async ping() {
    const t0 = Date.now();
    const res = await this.pool.request().query('SELECT @@VERSION AS v, DB_NAME() AS db');
    return {
      latencyMs: Date.now() - t0,
      serverVersion: String(res.recordset[0].v).split('\n')[0],
      databaseName: String(res.recordset[0].db)
    };
  }

  async close() {
    await this.pool?.close();
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests)
// ---------------------------------------------------------------------------
export class MemoryStore implements Store {
  tables = new Map<CollectionName, Map<string, StoredRow>>();
  meta = new Map<string, string>();
  failNextApply = false;

  async init() {
    for (const name of COLLECTION_NAMES) this.tables.set(name, new Map());
  }
  async load(collection: CollectionName) {
    return [...this.tables.get(collection)!.values()].sort((a, b) => a.seq - b.seq).map((r) => ({ ...r }));
  }
  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async apply(changes: Partial<Record<CollectionName, CollectionChanges>>, meta: Record<string, string>) {
    if (this.failNextApply) {
      this.failNextApply = false;
      throw new Error('simulated database failure');
    }
    // Stage first so a failure leaves the store untouched (same as a SQL transaction).
    for (const name of Object.keys(changes) as CollectionName[]) {
      const t = this.tables.get(name)!;
      const ch = changes[name]!;
      ch.deletes.forEach((id) => t.delete(id));
      ch.upserts.forEach((r) => t.set(r.id, { ...r }));
    }
    for (const [k, v] of Object.entries(meta)) this.meta.set(k, v);
  }
  async ping() {
    return { latencyMs: 0, serverVersion: 'In-memory test store', databaseName: 'memory' };
  }
  async close() {}
}

// ---------------------------------------------------------------------------
// Persistence: diff in-memory arrays against what was last saved
// ---------------------------------------------------------------------------
export type StateShape = { [K in CollectionName]: any[] } & { meta: Record<string, string> };

export class Persistence {
  private saved = new Map<CollectionName, Map<string, { json: string; seq: number }>>();
  private savedMeta: Record<string, string> = {};
  private minSeq = new Map<CollectionName, number>();
  private maxSeq = new Map<CollectionName, number>();

  constructor(private store: Store) {}

  /** Read everything from the database. */
  async loadAll(): Promise<StateShape> {
    const out: any = { meta: {} };
    this.saved.clear();
    for (const name of COLLECTION_NAMES) {
      const rows = await this.store.load(name);
      const m = new Map<string, { json: string; seq: number }>();
      let min = 0;
      let max = 0;
      rows.forEach((r, i) => {
        m.set(r.id, { json: r.data, seq: r.seq });
        if (i === 0) min = r.seq;
        if (r.seq < min) min = r.seq;
        if (r.seq > max) max = r.seq;
      });
      this.saved.set(name, m);
      this.minSeq.set(name, min);
      this.maxSeq.set(name, max);
      out[name] = rows.map((r) => JSON.parse(r.data));
    }
    return out;
  }

  /** Meta values are loaded on demand. */
  async getMeta(key: string): Promise<string | null> {
    return this.store.getMeta(key);
  }

  /** True when `state` differs from what is saved in the database. */
  async hasChanges(state: Record<CollectionName, any[]>, meta: Record<string, string> = {}): Promise<boolean> {
    return this.diff(state, meta).dirty;
  }

  /** Write the difference between `state` and the last saved copy. Throws on failure. */
  async commit(state: Record<CollectionName, any[]>, meta: Record<string, string> = {}): Promise<boolean> {
    const d = this.diff(state, meta);
    if (!d.dirty) return false;

    await this.store.apply(d.changes, d.metaChanges); // throws -> nothing is marked as saved

    this.saved = d.pendingSaved;
    this.minSeq = d.pendingMin;
    this.maxSeq = d.pendingMax;
    Object.assign(this.savedMeta, d.metaChanges);
    return true;
  }

  private diff(state: Record<CollectionName, any[]>, meta: Record<string, string>) {
    const changes: Partial<Record<CollectionName, CollectionChanges>> = {};
    const pendingSaved = new Map<CollectionName, Map<string, { json: string; seq: number }>>();
    const pendingMin = new Map<CollectionName, number>();
    const pendingMax = new Map<CollectionName, number>();
    let dirty = false;

    for (const name of COLLECTION_NAMES) {
      const spec: CollectionSpec = COLLECTIONS[name];
      const prev = this.saved.get(name)!;
      const arr = state[name];
      const next = new Map<string, { json: string; seq: number }>();
      const upserts: StoredRow[] = [];

      // Work out the position (seq) of new rows: rows added at the front of the array
      // get a seq lower than every existing row, rows added elsewhere get a higher one.
      let min = this.minSeq.get(name)!;
      let max = this.maxSeq.get(name)!;
      const firstExistingIdx = arr.findIndex((r) => prev.has(spec.id(r)));
      const leadingNew: any[] = [];
      if (firstExistingIdx > 0) for (let i = 0; i < firstExistingIdx; i++) leadingNew.push(arr[i]);
      const leadingSet = new Set(leadingNew);
      const leadingSeq = new Map<any, number>();
      for (let i = leadingNew.length - 1; i >= 0; i--) leadingSeq.set(leadingNew[i], --min);

      const seen = new Set<string>();
      for (const row of arr) {
        const id = spec.id(row);
        if (seen.has(id)) throw new Error(`Duplicate id '${id}' in ${name}`);
        seen.add(id);
        const json = JSON.stringify(row);
        const before = prev.get(id);
        let seq: number;
        if (before) seq = before.seq;
        else if (leadingSet.has(row)) seq = leadingSeq.get(row)!;
        else seq = ++max;
        next.set(id, { json, seq });
        if (!before || before.json !== json) {
          const cols: Record<string, string | number | null> = {};
          spec.cols.forEach((c) => (cols[c.name] = c.get(row)));
          upserts.push({ id, seq, cols, data: json });
        }
      }
      const deletes = [...prev.keys()].filter((id) => !next.has(id));
      if (upserts.length || deletes.length) {
        changes[name] = { upserts, deletes };
        dirty = true;
      }
      pendingSaved.set(name, next);
      pendingMin.set(name, min);
      pendingMax.set(name, max);
    }

    const metaChanges: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) if (this.savedMeta[k] !== v) metaChanges[k] = v;
    if (Object.keys(metaChanges).length) dirty = true;

    return { dirty, changes, metaChanges, pendingSaved, pendingMin, pendingMax };
  }

  setSavedMeta(key: string, value: string) {
    this.savedMeta[key] = value;
  }
}
