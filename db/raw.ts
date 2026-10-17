import { env } from 'cloudflare:workers';
import customerSeed from './customer-seed.json';
import contactSeed from './contact-seed.json';
import { assertRequiredSchema, ensureSchema } from './ensure-schema';

export function getD1() {
  if (!env.DB) throw new Error('数据库连接暂不可用');
  return env.DB;
}

/**
 * Ensures schema is complete, then seeds empty tables.
 * Schema source of truth: drizzle/ migrations (applied at deploy via wrangler).
 * ensureSchema mirrors those migrations so local/app boot never leaves
 * incomplete customers/leads (missing owner_user_id) or missing auth tables.
 */
export async function ensureDatabase() {
  const db = getD1();
  await ensureSchema(db);
  const check = await assertRequiredSchema(db);
  if (!check.ok) {
    throw new Error(`数据库结构不完整: ${check.missing.join(', ')}`);
  }

  const existing = await db.prepare('SELECT COUNT(*) AS count FROM customers').first<{ count: number }>();
  if (!existing?.count) {
    const now = new Date().toISOString();
    await db.batch(
      customerSeed.map((c) =>
        db
          .prepare(
            `INSERT INTO customers (name, province, salesperson, order_count, latest_order_date, latest_order_no, customer_level, communication_cycle, communicated, last_communication_at, communication_summary, contact_name, contact_phone, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            c.name,
            c.province,
            c.salesperson,
            c.orderCount,
            c.latestOrderDate,
            c.latestOrderNo,
            c.customerLevel,
            c.communicationCycle,
            0,
            null,
            '',
            '',
            '',
            '',
            now,
            now,
          ),
      ),
    );
  }

  const existingContacts = await db.prepare('SELECT COUNT(*) AS count FROM network_contacts').first<{ count: number }>();
  if (!existingContacts?.count) {
    const now = new Date().toISOString();
    await db.batch(
      contactSeed.map((item) =>
        db
          .prepare(
            `INSERT INTO network_contacts (sequence, name, importance, frequency, category, organization, industry, notes, initial_contact, contacted, last_contact_at, contact_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            item.sequence,
            item.name,
            item.importance,
            item.frequency,
            item.category,
            item.organization,
            item.industry,
            item.notes,
            item.initialContact,
            0,
            null,
            '',
            now,
            now,
          ),
      ),
    );
  }

  await db.prepare('PRAGMA optimize').run();
  return db;
}
