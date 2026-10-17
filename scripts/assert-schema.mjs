/**
 * Lightweight schema assert without Cloudflare D1.
 * Simulates ensureSchema CREATE IF NOT EXISTS + ALTER ADD against an in-memory table map,
 * then checks REQUIRED_COLUMNS.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'db/ensure-schema.ts'), 'utf8');

const requiredMatch = src.match(/export const REQUIRED_COLUMNS[^=]*=\s*(\{[\s\S]*?\});/);
if (!requiredMatch) {
  console.error('FAIL: could not parse REQUIRED_COLUMNS');
  process.exit(1);
}
const REQUIRED_COLUMNS = Function(`return (${requiredMatch[1]})`)();

/** @type {Map<string, Set<string>>} */
const tables = new Map();

function parseCreate(sql) {
  const m = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*)\)\s*$/i);
  if (!m) return;
  const name = m[1];
  const cols = new Set();
  for (const line of m[2].split(/,\s*(?![^()]*\))/)) {
    const t = line.trim();
    if (!t || /^(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK)/i.test(t)) continue;
    const col = t.split(/\s+/)[0].replace(/[`"]/g, '');
    if (col) cols.add(col);
  }
  if (!tables.has(name)) tables.set(name, cols);
}

function parseAlter(sql) {
  const m = sql.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
  if (!m) return;
  const [, table, col] = m;
  if (!tables.has(table)) tables.set(table, new Set());
  tables.get(table).add(col);
}

// Extract CREATE strings from template literals in CREATE_STATEMENTS array — run a simplified ensure:
const createBlock = src.slice(src.indexOf('const CREATE_STATEMENTS'), src.indexOf('const INDEX_STATEMENTS'));
for (const m of createBlock.matchAll(/`([\s\S]*?)`/g)) {
  parseCreate(m[1].replace(/\s+/g, ' ').trim());
}

// Simulate incomplete legacy customers (no owner_user_id) then ALTER path
tables.set(
  'customers_legacy_sim',
  new Set(['id', 'name', 'province', 'salesperson', 'created_at', 'updated_at']),
);

const alterBlock = src.slice(src.indexOf('const COLUMN_ALTERS'), src.indexOf('export async function ensureSchema'));
const alters = [...alterBlock.matchAll(/\['(\w+)',\s*'(\w+)',\s*"([^"]+)"\]|\['(\w+)',\s*'(\w+)',\s*'([^']+)'\]/g)];
for (const m of alters) {
  const table = m[1] || m[4];
  const col = m[2] || m[5];
  const ddl = m[3] || m[6];
  // apply to real tables
  if (!tables.has(table)) continue;
  if (!tables.get(table).has(col)) tables.get(table).add(col);
  // and to legacy sim for customers
  if (table === 'customers') tables.get('customers_legacy_sim').add(col);
}

const missing = [];
for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
  if (!tables.has(table)) {
    missing.push(`table:${table}`);
    continue;
  }
  const present = tables.get(table);
  for (const col of cols) {
    if (!present.has(col)) missing.push(`${table}.${col}`);
  }
}

if (!tables.get('customers_legacy_sim').has('owner_user_id')) {
  missing.push('legacy-repair:customers.owner_user_id');
}
if (!tables.get('crm_users').has('manager_id')) {
  missing.push('crm_users.manager_id');
}

// Migration files must exist
try {
  const mig = readFileSync(join(root, 'drizzle/0006_manager_id.sql'), 'utf8');
  if (!mig.includes('manager_id')) missing.push('migration:0006 missing manager_id');
} catch {
  missing.push('migration:0006 file missing');
}
try {
  const mig7 = readFileSync(join(root, 'drizzle/0007_crm_core.sql'), 'utf8');
  for (const needle of ['stage', 'account_contacts', 'opportunities', 'follow_ups', 'stage_histories']) {
    if (!mig7.includes(needle)) missing.push(`migration:0007 missing ${needle}`);
  }
} catch {
  missing.push('migration:0007 file missing');
}

if (missing.length) {
  console.error('FAIL schema assert:', missing.join(', '));
  process.exit(1);
}

console.log('OK ensure-schema covers', Object.keys(REQUIRED_COLUMNS).join(', '));
console.log('OK customers.owner_user_id/stage, leads.stage/converted, crm_users.manager_id, opportunities, follow_ups present');
console.log('OK legacy incomplete customers would gain owner_user_id via ALTER');
