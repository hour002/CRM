import type { EnsureDb } from '@/db/ensure-schema';

export async function recordStageChange(
  db: EnsureDb,
  opts: {
    targetType: 'lead' | 'account' | 'opportunity';
    targetId: number;
    fromStage: string;
    toStage: string;
    changedBy: number;
    at?: string;
  },
) {
  if (opts.fromStage === opts.toStage) return;
  const at = opts.at || new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO stage_histories (target_type, target_id, from_stage, to_stage, changed_by, changed_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(opts.targetType, opts.targetId, opts.fromStage, opts.toStage, opts.changedBy, at)
    .run();
}
