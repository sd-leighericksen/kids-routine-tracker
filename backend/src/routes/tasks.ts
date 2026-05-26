import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';
import { db } from '../db.js';
import type { TaskRow } from '../types.js';

const taskBodyCreate = {
  type: 'object',
  required: ['name', 'emoji'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    emoji: { type: 'string', minLength: 1, maxLength: 16 },
  },
} as const;

const taskBodyPatch = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: taskBodyCreate.properties,
} as const;

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface CreateBody {
  name: string;
  emoji: string;
}

interface PatchBody {
  name?: string;
  emoji?: string;
}

export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/tasks', async () => {
    return db
      .prepare('SELECT * FROM tasks ORDER BY name, id')
      .all() as TaskRow[];
  });

  fastify.get<{ Params: { id: number } }>(
    '/api/tasks/:id',
    { schema: { params: idParam } },
    async (req, reply) => {
      const row = db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(req.params.id) as TaskRow | undefined;
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return row;
    },
  );

  fastify.post<{ Body: CreateBody }>(
    '/api/tasks',
    { preHandler: requireParentPin, schema: { body: taskBodyCreate } },
    async (req, reply) => {
      const { name, emoji } = req.body;
      const result = db
        .prepare('INSERT INTO tasks (name, emoji) VALUES (?, ?)')
        .run(name, emoji);
      const row = db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(result.lastInsertRowid) as TaskRow;
      return reply.code(201).send(row);
    },
  );

  fastify.patch<{ Params: { id: number }; Body: PatchBody }>(
    '/api/tasks/:id',
    {
      preHandler: requireParentPin,
      schema: { params: idParam, body: taskBodyPatch },
    },
    async (req, reply) => {
      const id = req.params.id;
      const fields: string[] = [];
      const values: unknown[] = [];
      if (req.body.name !== undefined) {
        fields.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.emoji !== undefined) {
        fields.push('emoji = ?');
        values.push(req.body.emoji);
      }
      fields.push("updated_at = datetime('now')");
      values.push(id);
      const result = db
        .prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(id) as TaskRow;
    },
  );

  fastify.delete<{ Params: { id: number } }>(
    '/api/tasks/:id',
    { preHandler: requireParentPin, schema: { params: idParam } },
    async (req, reply) => {
      const result = db
        .prepare('DELETE FROM tasks WHERE id = ?')
        .run(req.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    },
  );
};
