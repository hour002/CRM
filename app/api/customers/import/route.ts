import { requireAdmin, forbidden } from '@/app/auth';
import { ensureDatabase } from '@/db/raw';

type ImportRow = {
  name?: unknown; province?: unknown; city?: unknown; address?: unknown;
  latitude?: unknown; longitude?: unknown; customerLevel?: unknown;
  salesperson?: unknown; contactName?: unknown; contactPhone?: unknown; tags?: unknown;
};
type NormalizedRow = {
  name: string; province: string; city: string; address: string; latitude: number | null; longitude: number | null;
  customerLevel: string; salesperson: string; contactName: string; contactPhone: string; tags: string;
};

const validLevels = new Set(['大客户', '重点客户', '一般客户']);
const cycleByLevel: Record<string, string> = { 大客户: '每周', 重点客户: '每月', 一般客户: '每季度' };
const clean = (value: unknown) => String(value ?? '').trim().slice(0, 500);
const coordinate = (value: unknown, min: number, max: number) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  try {
    const body = await request.json() as { rows?: ImportRow[] };
    if (!Array.isArray(body.rows) || !body.rows.length) return Response.json({ error: '没有可导入的客户' }, { status: 400 });
    if (body.rows.length > 500) return Response.json({ error: '单次最多导入 500 家客户' }, { status: 400 });

    const unique = new Map<string, NormalizedRow>();
    for (const source of body.rows) {
      const name = clean(source.name);
      if (!name) continue;
      const customerLevel = validLevels.has(clean(source.customerLevel)) ? clean(source.customerLevel) : '一般客户';
      unique.set(name, {
        name,
        province: clean(source.province) || '待补充',
        city: clean(source.city),
        address: clean(source.address),
        latitude: coordinate(source.latitude, -90, 90),
        longitude: coordinate(source.longitude, -180, 180),
        customerLevel,
        salesperson: clean(source.salesperson),
        contactName: clean(source.contactName),
        contactPhone: clean(source.contactPhone),
        tags: clean(source.tags),
      });
    }
    const rows = [...unique.values()];
    if (!rows.length) return Response.json({ error: '未识别到客户名称列或有效客户名称' }, { status: 400 });

    const db = await ensureDatabase();
    const existing = new Set<string>();
    for (let start = 0; start < rows.length; start += 50) {
      const names = rows.slice(start, start + 50).map((row) => row.name);
      const placeholders = names.map(() => '?').join(',');
      const result = await db.prepare(`SELECT name FROM customers WHERE name IN (${placeholders})`).bind(...names).all<{ name: string }>();
      for (const item of result.results) existing.add(item.name);
    }

    const now = new Date().toISOString();
    for (let start = 0; start < rows.length; start += 40) {
      const statements = rows.slice(start, start + 40).map((row) => {
        const precision = row.latitude !== null && row.longitude !== null ? 'exact' : row.city ? 'city' : 'province';
        return db.prepare(`INSERT INTO customers (name, province, city, address, latitude, longitude, location_precision, salesperson, customer_level, communication_cycle, contact_name, contact_phone, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            province = CASE WHEN excluded.province <> '待补充' THEN excluded.province ELSE customers.province END,
            city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE customers.city END,
            address = CASE WHEN excluded.address <> '' THEN excluded.address ELSE customers.address END,
            latitude = COALESCE(excluded.latitude, customers.latitude), longitude = COALESCE(excluded.longitude, customers.longitude),
            location_precision = CASE WHEN excluded.latitude IS NOT NULL AND excluded.longitude IS NOT NULL THEN 'exact' WHEN excluded.city <> '' THEN 'city' ELSE customers.location_precision END,
            salesperson = CASE WHEN excluded.salesperson <> '' THEN excluded.salesperson ELSE customers.salesperson END,
            customer_level = excluded.customer_level, communication_cycle = excluded.communication_cycle,
            contact_name = CASE WHEN excluded.contact_name <> '' THEN excluded.contact_name ELSE customers.contact_name END,
            contact_phone = CASE WHEN excluded.contact_phone <> '' THEN excluded.contact_phone ELSE customers.contact_phone END,
            tags = CASE WHEN excluded.tags <> '' THEN excluded.tags ELSE customers.tags END, updated_at = excluded.updated_at`)
          .bind(row.name, row.province, row.city, row.address, row.latitude, row.longitude, precision, row.salesperson, row.customerLevel, cycleByLevel[row.customerLevel], row.contactName, row.contactPhone, row.tags, now, now);
      });
      await db.batch(statements);
    }
    return Response.json({ processed: rows.length, inserted: rows.length - existing.size, updated: existing.size });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '导入失败' }, { status: 500 });
  }
}
