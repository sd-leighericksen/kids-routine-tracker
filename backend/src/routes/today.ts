import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';
import { db } from '../db.js';
import {
  ensureSnapshot,
  finalizeDueBlocks,
  getLocalDate,
} from '../lifecycle.js';

interface DailyLogRow {
  id: number;
  date: string;
  block_id: number | null;
  block_name: string;
  block_start_time: string | null;
  block_deadline_time: string;
  child_id: number | null;
  child_name: string;
  child_image: string | null;
  task_id: number | null;
  task_name: string;
  task_emoji: string;
  completed: number;
  completed_at: string | null;
  block_outcome: string | null;
}

type BlockState = 'active' | 'locked-complete' | 'locked-missed';

interface BlockGrid {
  id: number;
  name: string;
  start_time: string;
  deadline_time: string;
  state: BlockState;
  children: { id: number; name: string; image: string | null }[];
  tasks: { id: number; name: string; emoji: string }[];
  logs: {
    id: number;
    child_id: number;
    task_id: number;
    completed: boolean;
    completed_at: string | null;
  }[];
}

function deriveBlockState(outcome: string | null): BlockState {
  if (outcome === 'complete') return 'locked-complete';
  if (outcome === 'missed') return 'locked-missed';
  return 'active';
}

const querystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
  },
} as const;

export const todayRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { date?: string } }>(
    '/api/today',
    { schema: { querystring } },
    async (req) => {
      const date = req.query.date ?? getLocalDate();
      ensureSnapshot(date);
      finalizeDueBlocks(date);

      const logs = db
        .prepare(
          `SELECT id, date, block_id, block_name, block_start_time, block_deadline_time,
                  child_id, child_name, child_image,
                  task_id, task_name, task_emoji,
                  completed, completed_at, block_outcome
           FROM daily_logs
           WHERE date = ? AND block_id IS NOT NULL
           ORDER BY block_id, child_id, task_id`,
        )
        .all(date) as DailyLogRow[];

      const blockMap = new Map<number, BlockGrid>();
      const seenChildren = new Map<number, Set<number>>();
      const seenTasks = new Map<number, Set<number>>();

      for (const log of logs) {
        if (
          log.block_id == null ||
          log.child_id == null ||
          log.task_id == null
        ) {
          continue;
        }
        let block = blockMap.get(log.block_id);
        if (!block) {
          block = {
            id: log.block_id,
            name: log.block_name,
            start_time: log.block_start_time ?? '00:00',
            deadline_time: log.block_deadline_time,
            state: deriveBlockState(log.block_outcome),
            children: [],
            tasks: [],
            logs: [],
          };
          blockMap.set(log.block_id, block);
          seenChildren.set(log.block_id, new Set());
          seenTasks.set(log.block_id, new Set());
        }
        const childSet = seenChildren.get(log.block_id)!;
        if (!childSet.has(log.child_id)) {
          childSet.add(log.child_id);
          block.children.push({
            id: log.child_id,
            name: log.child_name,
            image: log.child_image,
          });
        }
        const taskSet = seenTasks.get(log.block_id)!;
        if (!taskSet.has(log.task_id)) {
          taskSet.add(log.task_id);
          block.tasks.push({
            id: log.task_id,
            name: log.task_name,
            emoji: log.task_emoji,
          });
        }
        block.logs.push({
          id: log.id,
          child_id: log.child_id,
          task_id: log.task_id,
          completed: !!log.completed,
          completed_at: log.completed_at,
        });
      }

      for (const block of blockMap.values()) {
        block.children.sort((a, b) => a.name.localeCompare(b.name));
        block.tasks.sort((a, b) => a.name.localeCompare(b.name));
      }

      const blocks = Array.from(blockMap.values()).sort((a, b) =>
        a.deadline_time.localeCompare(b.deadline_time),
      );

      return { date, blocks };
    },
  );

  // Re-apply current assignments to today's grid. Wipes today's daily_logs +
  // daily_snapshots row so the next GET /api/today re-snapshots from the live
  // assignments table. Today's webhook_events audit rows are preserved.
  // Past days are never touched.
  fastify.post(
    '/api/today/reset',
    { preHandler: requireParentPin },
    async () => {
      const date = getLocalDate();
      db.transaction(() => {
        db.prepare('DELETE FROM daily_logs WHERE date = ?').run(date);
        db.prepare('DELETE FROM daily_snapshots WHERE date = ?').run(date);
      })();
      return { ok: true, date };
    },
  );
};
