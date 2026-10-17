# Fix priorities (from code review 2026-10-17)

## Must fix first
1. Unify schema creation: remove dual path. Prefer drizzle migrations as source of truth; make `db/raw.ts` `ensureDatabase()` either call migrations / no longer hand-CREATE incomplete tables, OR sync CREATE TABLE to include owner_user_id + crm_users/crm_sessions/audit_logs. One path only.
2. Add `manager_id` on users + direct-manager read+assign (not edit) policy; subordinate overdue dashboard stub.
3. Account disable must transfer owned data to a specified recipient.

## Then (if time)
- Align toward Prompt 0 model where practical without full rewrite: stage for leads, convert, opportunities, polymorphic follow_ups — but do NOT abandon working auth/isolation; extend this codebase.
- Spec: docs/crm-design-spec.md

## Constraints
- Keep existing network_contacts / prototype features working if present.
- No approval workflows / teams / open registration.
- Commit locally; do not push unless asked.
- Work only under /workspace/customer-crm-fix
