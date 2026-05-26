import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';
import { db } from '../db.js';
import type { AssignmentJoined, AssignmentRow } from '../types.js';

const assignmentBody = {
  type: 'object',
  required: ['block_id', 'child_id', 'task_id'],
  additionalProperties: false,
  properties: {
    block_id: { type: 'integer', minimum: 1 },
    child_id: { type: 'integer', minimum: 1 },
    task_id: { type: 'integer', minimum: 1 },
    display_order: { type: 'integer', minimum: 0 },
  },
} as const;

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface CreateBody {
  block_id: number;
  child_id: number;
  task_id: number;
  display_order?: number;
}

export const assignmentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/assignments', async () => {
    return db
      .prepare(
        `SELECT
          a.id, a.block_id, a.child_id, a.task_id, a.display_order, a.created_at,
          b.name AS block_name,
          c.name AS child_name,
          t.name AS task_name,
          t.emoji AS task_emoji
         FROM assignments a
         JOIN blocks b ON b.id = a.block_id
         JOIN children c ON c.id = a.child_id
         JOIN tasks t ON t.id = a.task_id
         ORDER BY b.display_order, b.deadline_time, c.display_order, c.name, a.display_order, t.name`,
      )
      .all() as AssignmentJoined[];
  });

  fastify.post<{ Body: CreateBody }>(
    '/api/assignments',
    { preHandler: requireParentPin, schema: { body: assignmentBody } },
    async (req, reply) => {
      const { block_id, child_id, task_id, display_order = 0 } = req.body;
      try {
        const result = db
          .prepare(
            'INSERT INTO assignments (block_id, child_id, task_id, display_order) VALUES (?, ?, ?, ?)',
          )
          .run(block_id, child_id, task_id, display_order);
        const row = db
          .prepare('SELECT * FROM assignments WHERE id = ?')
          .get(result.lastInsertRowid) as AssignmentRow;
        return reply.code(201).send(row);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return reply.code(409).send({ error: 'Assignment already exists' });
        }
        if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
          return reply
            .code(400)
            .send({ error: 'Unknown block_id, child_id, or task_id' });
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: number } }>(
    '/api/assignments/:id',
    { preHandler: requireParentPin, schema: { params: idParam } },
    async (req, reply) => {
      const result = db
        .prepare('DELETE FROM assignments WHERE id = ?')
        .run(req.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    },
  );
};
