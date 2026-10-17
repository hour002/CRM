# Schema & access fixes (2026-10-17)

## Chosen approach: drizzle migrations = source of truth

1. **Deploy / Docker**: `server-deploy/entrypoint.sh` already runs  
   `wrangler d1 migrations apply DB --local ...` before the app starts.  
   New change: `drizzle/0006_manager_id.sql` adds `crm_users.manager_id`.

2. **Runtime safety net**: `db/ensure-schema.ts` (called from `ensureDatabase()` in `db/raw.ts`)  
   - Uses **complete** `CREATE TABLE IF NOT EXISTS` (includes `owner_user_id`, auth tables, `manager_id`).  
   - Then **ALTER ADD** any missing critical columns if an older incomplete table already existed.  
   - Asserts required tables/columns; throws if still incomplete.  
   - **No longer** creates the old incomplete `customers`/`leads` definitions that omitted `owner_user_id` and skipped `crm_users` / `crm_sessions` / `audit_logs`.

3. Do **not** maintain a second divergent hand-written schema. When adding columns:  
   update `db/schema.ts` → `drizzle-kit generate` (or hand-add `drizzle/000N_*.sql` + journal) → mirror in `ensure-schema.ts` CREATE/ALTER lists.

## Access policy (this pass)

- Direct manager (`crm_users.manager_id`): **read + assign** on subordinate-owned customers/leads; **no** business-field write; **no** completing subordinate visits/todos.
- Disable user: `PATCH /api/admin/users/:id` with `{ active: false, transferToUserId }` reassigns `customers`/`leads` ownership, clears subordinates’ `manager_id` pointing at the disabled user, revokes sessions, writes audit log `停用并转移`.

## How to run

```bash
cd /workspace/customer-crm-fix
pnpm install   # or npm install
# apply migrations locally (when using wrangler/D1):
# npx wrangler d1 migrations apply DB --local --config <wrangler.jsonc>
pnpm dev       # or npm run dev
node scripts/assert-schema.mjs
node scripts/assert-access.mjs
```

## CRM core (2026-10-17 pass 2)

### Lead status ↔ stage dual-write

| Legacy `status` (old UI) | Prompt-0 `stage` |
|---|---|
| 新线索 | 待处理 |
| 已联系 | 跟进中 |
| 方案报价 | 提交需求 |
| 需求确认 | 确认需求 |
| 赢单 | 已转化 |
| 暂缓 | 无效 |

- Column `status` kept for backward compatibility; `stage` is source of truth going forward.
- PATCH accepts either `status` or `stage` and writes both.
- New leads default `stage=待处理` / `status=新线索`.
- Convert: `POST /api/leads/:id/convert` creates/links customer, sets `converted_*`, `stage=已转化`, **does not delete** the lead.
- Invalid: `PATCH /api/leads/:id/invalid` requires `invalidReason`.

### New tables (migration `0007_crm_core.sql`)

- `account_contacts` — CRM contacts under `customers` (`account_id`). APIs: `GET/POST /api/customers/:id/contacts`, `PATCH/DELETE /api/account-contacts/:id` (path avoids clash with network `/api/contacts`).
- `opportunities` — dual amounts, code `OPP-YYYYMMDD-0001`, `account_id` required; creating with unconverted `leadId` → **400**.
- `follow_ups` — polymorphic `lead|account|opportunity`; pending requires `next_contact_at`; complete may spawn next pending.
- `stage_histories` — written on lead/opportunity stage changes.
- `customers.stage` — account stage machine default `潜在`.

### APIs added

| Method | Path |
|---|---|
| POST | `/api/leads/:id/convert` |
| PATCH | `/api/leads/:id/invalid` |
| GET/POST | `/api/opportunities` |
| GET/PATCH | `/api/opportunities/:id` |
| GET/POST | `/api/follow-ups` |
| PATCH | `/api/follow-ups/:id/complete` |
| GET | `/api/dashboard/todos` |
| GET | `/api/dashboard/subordinate-overdue` |
| GET/POST | `/api/customers/:id/contacts` |
| PATCH/DELETE | `/api/account-contacts/:id` |

### Policy (unchanged)

owner / direct manager read+assign / admin. Collaborators **not** implemented this pass (remaining).

### Remaining gaps

- Attachments, watches/reminders, import preview/confirm, collaborators, opportunity import, soft-delete, richer account-contact UI in drawer.
