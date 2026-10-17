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
