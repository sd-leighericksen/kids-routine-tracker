import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { finalizeDueBlocks } from '../lifecycle.js';
import {
  recordAndDeliver,
  type ChildAllCompleteEvent,
  type TaskCompletedEvent,
} from '../webhooks.js';

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const patchBody = {
  type: 'object',
  required: ['completed'],
  additionalProperties: false,
  properties: { completed: { type: 'boolean' } },
} as const;

interface BeforeRow {
  id: number;
  date: string;
  block_id: number | null;
  block_name: string;
  block_deadline_time: string;
  child_id: number | null;
  child_name: string;
  child_image: string | null;
  task_id: number | null;
  task_name: string;
  task_emoji: string;
  completed: number;
  block_outcome: string | null;
}

interface UpdatedRow {
  id: number;
  date: string;
  block_id: number | null;
  child_id: number | null;
  task_id: number | null;
  completed: number;
  completed_at: string | null;
  block_outcome: string | null;
}

// Kid-facing — no PIN required.
export const logsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Params: { id: number }; Body: { completed: boolean } }>(
    '/api/logs/:id',
    { schema: { params: idParam, body: patchBody } },
    async (req, reply) => {
      const { id } = req.params;
      const { completed } = req.body;

      const before = db
        .prepare(
          `SELECT id, date, block_id, block_name, block_deadline_time,
                  child_id, child_name, child_image,
                  task_id, task_name, task_emoji,
                  completed, block_outcome
             FROM daily_logs WHERE id = ?`,
        )
        .get(id) as BeforeRow | undefined;
      if (!before) return reply.code(404).send({ error: 'Log not found' });

      // Catch a deadline that may have crossed since the last GET /api/today.
      // finalizeDueBlocks itself fires block.deadline_missed if applicable.
      finalizeDueBlocks(before.date);
      const fresh = db
        .prepare('SELECT block_outcome FROM daily_logs WHERE id = ?')
        .get(id) as { block_outcome: string | null };
      if (fresh.block_outcome !== null) {
        return reply
          .code(409)
          .send({ error: 'Block is locked', state: fresh.block_outcome });
      }

      db.prepare(
        `UPDATE daily_logs
            SET completed = ?,
                completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
          WHERE id = ?`,
      ).run(completed ? 1 : 0, completed ? 1 : 0, id);

      const row = db
        .prepare(
          `SELECT id, date, block_id, child_id, task_id,
                  completed, completed_at, block_outcome
             FROM daily_logs WHERE id = ?`,
        )
        .get(id) as UpdatedRow;

      // Fire task.completed only on a false→true transition. No fire on
      // un-mark, no fire on idempotent re-set to the same value.
      if (
        completed &&
        !before.completed &&
        before.block_id != null &&
        before.child_id != null &&
        before.task_id != null
      ) {
        const taskEvent: TaskCompletedEvent = {
          type: 'task.completed',
          timestamp: new Date().toISOString(),
          date: before.date,
          child: {
            id: before.child_id,
            name: before.child_name,
            image: before.child_image,
          },
          block: {
            id: before.block_id,
            name: before.block_name,
            deadline_time: before.block_deadline_time,
          },
          task: {
            id: before.task_id,
            name: before.task_name,
            emoji: before.task_emoji,
          },
          log_id: before.id,
        };
        recordAndDeliver(taskEvent);

        const stats = db
          .prepare(
            `SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
               FROM daily_logs
              WHERE date = ? AND block_id = ? AND child_id = ?`,
          )
          .get(before.date, before.block_id, before.child_id) as {
          total: number;
          done: number;
        };

        if (stats.total > 0 && stats.done === stats.total) {
          const tasks = db
            .prepare(
              `SELECT task_id, task_name, task_emoji
                 FROM daily_logs
                WHERE date = ? AND block_id = ? AND child_id = ?
                ORDER BY task_name`,
            )
            .all(before.date, before.block_id, before.child_id) as {
            task_id: number;
            task_name: string;
            task_emoji: string;
          }[];

          const allCompleteEvent: ChildAllCompleteEvent = {
            type: 'child.all_complete',
            timestamp: new Date().toISOString(),
            date: before.date,
            child: {
              id: before.child_id,
              name: before.child_name,
              image: before.child_image,
            },
            block: {
              id: before.block_id,
              name: before.block_name,
              deadline_time: before.block_deadline_time,
            },
            tasks: tasks.map((t) => ({
              id: t.task_id,
              name: t.task_name,
              emoji: t.task_emoji,
            })),
          };
          recordAndDeliver(allCompleteEvent);
        }
      }

      return {
        ...row,
        completed: !!row.completed,
      };
    },
  );
};
