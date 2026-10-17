/**
 * Pure policy checks mirroring evaluateOwnershipAccess / decideAccess rules.
 * (Does not import TS; keeps the matrix explicit for regression.)
 */
function decide(actor, ownerUserId, ownerManagerId, mode) {
  if (actor.role === 'admin') return true;
  if (actor.id == null) return false;
  const isOwner = ownerUserId != null && ownerUserId === actor.id;
  const isDirectManager = ownerManagerId != null && ownerManagerId === actor.id;
  if (mode === 'read' || mode === 'assign') return isOwner || isDirectManager;
  return isOwner;
}

const cases = [
  [{ id: 1, role: 'sales' }, 1, 9, 'write', true, 'owner can write'],
  [{ id: 9, role: 'sales' }, 1, 9, 'write', false, 'manager cannot write'],
  [{ id: 9, role: 'sales' }, 1, 9, 'read', true, 'manager can read'],
  [{ id: 9, role: 'sales' }, 1, 9, 'assign', true, 'manager can assign'],
  [{ id: 2, role: 'sales' }, 1, 9, 'read', false, 'peer cannot read'],
  [{ id: 1, role: 'admin' }, 99, null, 'write', true, 'admin can write'],
  [{ id: 9, role: 'sales' }, 1, 8, 'read', false, 'non-direct manager cannot read'],
];

let failed = 0;
for (const [actor, owner, mgr, mode, expected, label] of cases) {
  const got = decide(actor, owner, mgr, mode);
  if (got !== expected) {
    console.error(`FAIL ${label}: expected ${expected} got ${got}`);
    failed++;
  } else {
    console.log(`OK ${label}`);
  }
}

if (failed) process.exit(1);
console.log('OK access policy matrix');
