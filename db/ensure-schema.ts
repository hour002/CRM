/**
 * Runtime schema ensure aligned with drizzle migrations (0000–0006).
 * Drizzle migrations remain the source of truth for deploy (wrangler d1 migrations apply).
 * This module only fills gaps when the app starts without migrations having run,
 * and repairs incomplete CREATE TABLE leftovers (missing owner_user_id / auth tables).
 */

type Stmt = {
  bind: (...args: unknown[]) => Stmt;
  run: () => Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
};

export type EnsureDb = {
  prepare: (sql: string) => Stmt;
  batch: (statements: Array<Promise<unknown> | Stmt | { run: () => Promise<unknown> }>) => Promise<unknown>;
};

async function columnNames(db: EnsureDb, table: string): Promise<Set<string>> {
  try {
    const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    return new Set((rows.results || []).map((r) => r.name));
  } catch {
    return new Set();
  }
}

async function tableExists(db: EnsureDb, table: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .bind(table)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function ensureColumn(db: EnsureDb, table: string, column: string, ddl: string) {
  if (!(await tableExists(db, table))) return;
  const cols = await columnNames(db, table);
  if (!cols.has(column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  }
}

/** Full CREATE TABLE IF NOT EXISTS matching current drizzle schema (+ manager_id). */
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    province TEXT NOT NULL DEFAULT '待补充',
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    location_precision TEXT NOT NULL DEFAULT 'province',
    salesperson TEXT NOT NULL DEFAULT '',
    order_count INTEGER NOT NULL DEFAULT 0,
    latest_order_date TEXT NOT NULL DEFAULT '',
    latest_order_no TEXT NOT NULL DEFAULT '',
    customer_level TEXT NOT NULL DEFAULT '一般客户',
    communication_cycle TEXT NOT NULL DEFAULT '每季度',
    communicated INTEGER NOT NULL DEFAULT 0,
    last_communication_at TEXT,
    communication_summary TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    owner_user_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    customer_id INTEGER NOT NULL,
    communicated_at TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '主动拓展',
    status TEXT NOT NULL DEFAULT '新线索',
    province TEXT NOT NULL DEFAULT '待补充',
    owner_user_id INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customer_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    customer_id INTEGER NOT NULL,
    planned_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '待拜访',
    purpose TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS prototype_specs (
    id INTEGER PRIMARY KEY NOT NULL,
    content TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS network_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL,
    importance TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT '待设定',
    category TEXT NOT NULL DEFAULT '未分类',
    organization TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    initial_contact TEXT NOT NULL DEFAULT '',
    contacted INTEGER NOT NULL DEFAULT 0,
    last_contact_at TEXT,
    contact_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS network_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    contact_id INTEGER NOT NULL,
    contacted_at TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (contact_id) REFERENCES network_contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS crm_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales',
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 120000,
    active INTEGER NOT NULL DEFAULT 1,
    manager_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS crm_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    actor_user_id INTEGER,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES crm_users(id) ON DELETE SET NULL
  )`,
];

const INDEX_STATEMENTS = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name ON customers(name)',
  'CREATE INDEX IF NOT EXISTS idx_customers_province ON customers(province)',
  'CREATE INDEX IF NOT EXISTS idx_customers_province_city ON customers(province, city)',
  'CREATE INDEX IF NOT EXISTS idx_customers_cycle_communicated ON customers(communication_cycle, communicated)',
  'CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_interactions_customer_date ON interactions(customer_id, communicated_at)',
  'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)',
  'CREATE INDEX IF NOT EXISTS idx_leads_owner_status ON leads(owner_user_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_planned ON customer_visits(customer_id, planned_at)',
  'CREATE INDEX IF NOT EXISTS idx_customer_visits_status_planned ON customer_visits(status, planned_at)',
  'CREATE INDEX IF NOT EXISTS idx_network_contacts_category ON network_contacts(category)',
  'CREATE INDEX IF NOT EXISTS idx_network_contacts_frequency_contacted ON network_contacts(frequency, contacted)',
  'CREATE INDEX IF NOT EXISTS idx_network_interactions_contact_date ON network_interactions(contact_id, contacted_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_users_username ON crm_users(username)',
  'CREATE INDEX IF NOT EXISTS idx_crm_users_role_active ON crm_users(role, active)',
  'CREATE INDEX IF NOT EXISTS idx_crm_users_manager ON crm_users(manager_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_sessions_token_hash ON crm_sessions(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_crm_sessions_user_expiry ON crm_sessions(user_id, expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at)',
];

/** Columns that must exist even if an older incomplete CREATE TABLE left the table behind. */
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  customers: ['owner_user_id', 'city', 'address', 'latitude', 'longitude', 'location_precision'],
  leads: ['owner_user_id'],
  crm_users: ['manager_id', 'username', 'password_hash', 'active'],
  crm_sessions: ['token_hash', 'user_id', 'expires_at'],
  audit_logs: ['actor_name', 'action', 'target_type', 'created_at'],
};

const COLUMN_ALTERS: Array<[string, string, string]> = [
  ['customers', 'owner_user_id', 'owner_user_id INTEGER'],
  ['customers', 'city', "city TEXT NOT NULL DEFAULT ''"],
  ['customers', 'address', "address TEXT NOT NULL DEFAULT ''"],
  ['customers', 'latitude', 'latitude REAL'],
  ['customers', 'longitude', 'longitude REAL'],
  ['customers', 'location_precision', "location_precision TEXT NOT NULL DEFAULT 'province'"],
  ['leads', 'owner_user_id', 'owner_user_id INTEGER'],
  ['crm_users', 'manager_id', 'manager_id INTEGER'],
];

export async function ensureSchema(db: EnsureDb): Promise<void> {
  await db.batch(CREATE_STATEMENTS.map((sql) => db.prepare(sql)));
  for (const [table, column, ddl] of COLUMN_ALTERS) {
    await ensureColumn(db, table, column, ddl);
  }
  await db.batch(INDEX_STATEMENTS.map((sql) => db.prepare(sql)));
}

export async function assertRequiredSchema(db: EnsureDb): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    if (!(await tableExists(db, table))) {
      missing.push(`table:${table}`);
      continue;
    }
    const present = await columnNames(db, table);
    for (const col of cols) {
      if (!present.has(col)) missing.push(`${table}.${col}`);
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}
