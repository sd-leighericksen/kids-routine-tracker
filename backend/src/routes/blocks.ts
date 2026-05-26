import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';
import { db } from '../db.js';
import type { BlockRow } from '../types.js';

const TIME_PATTERN = '^([01][0-9]|2[0-3]):[0-5][0-9]$';

const blockBodyCreate = {
  type: 'object',
  required: ['name', 'start_time', 'deadline_time'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    start_time: { type: 'string', pattern: TIME_PATTERN },
    deadline_time: { type: 'string', pattern: TIME_PATTERN },
    color: { type: ['string', 'null'], maxLength: 32 },
    display_order: { type: 'integer', minimum: 0 },
  },
} as const;

const blockBodyPatch = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: blockBodyCreate.properties,
} as const;

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface CreateBody {
  name: string;
  start_time: string;
  deadline_time: string;
  color?: string | null;
  display_order?: number;
}

interface PatchBody {
  name?: string;
  start_time?: string;
  deadline_time?: string;
  color?: string | null;
  display_order?: number;
}

function validateWindow(start: string, end: string): string | null {
  if (start >= end) return 'start_time must be earlier than deadline_time';
  return null;
}

export const blocksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/blocks', async () => {
    return db
      .prepare(
        'SELECT * FROM blocks ORDER BY display_order, deadline_time, id',
      )
      .all() as BlockRow[];
  });

  fastify.get<{ Params: { id: number } }>(
    '/api/blocks/:id',
    { schema: { params: idParam } },
    async (req, reply) => {
      const row = db
        .prepare('SELECT * FROM blocks WHERE id = ?')
        .get(req.params.id) as BlockRow | undefined;
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return row;
    },
  );

  fastify.post<{ Body: CreateBody }>(
    '/api/blocks',
    { preHandler: requireParentPin, schema: { body: blockBodyCreate } },
    async (req, reply) => {
      const {
        name,
        start_time,
        deadline_time,
        color = null,
        display_order = 0,
      } = req.body;
      const windowError = validateWindow(start_time, deadline_time);
      if (windowError) return reply.code(400).send({ error: windowError });

      const result = db
        .prepare(
          'INSERT INTO blocks (name, start_time, deadline_time, color, display_order) VALUES (?, ?, ?, ?, ?)',
        )
        .run(name, start_time, deadline_time, color, display_order);
      const row = db
        .prepare('SELECT * FROM blocks WHERE id = ?')
        .get(result.lastInsertRowid) as BlockRow;
      return reply.code(201).send(row);
    },
  );

  fastify.patch<{ Params: { id: number }; Body: PatchBody }>(
    '/api/blocks/:id',
    {
      preHandler: requireParentPin,
      schema: { params: idParam, body: blockBodyPatch },
    },
    async (req, reply) => {
      const id = req.params.id;
      const current = db
        .prepare('SELECT start_time, deadline_time FROM blocks WHERE id = ?')
        .get(id) as { start_time: string; deadline_time: string } | undefined;
      if (!current) return reply.code(404).send({ error: 'Not found' });

      const nextStart = req.body.start_time ?? current.start_time;
      const nextEnd = req.body.deadline_time ?? current.deadline_time;
      const windowError = validateWindow(nextStart, nextEnd);
      if (windowError) return reply.code(400).send({ error: windowError });

      const fields: string[] = [];
      const values: unknown[] = [];
      if (req.body.name !== undefined) {
        fields.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.start_time !== undefined) {
        fields.push('start_time = ?');
        values.push(req.body.start_time);
      }
      if (req.body.deadline_time !== undefined) {
        fields.push('deadline_time = ?');
        values.push(req.body.deadline_time);
      }
      if (req.body.color !== undefined) {
        fields.push('color = ?');
        values.push(req.body.color);
      }
      if (req.body.display_order !== undefined) {
        fields.push('display_order = ?');
        values.push(req.body.display_order);
      }
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`).run(
        ...values,
      );
      return db
        .prepare('SELECT * FROM blocks WHERE id = ?')
        .get(id) as BlockRow;
    },
  );

  fastify.delete<{ Params: { id: number } }>(
    '/api/blocks/:id',
    { preHandler: requireParentPin, schema: { params: idParam } },
    async (req, reply) => {
      const result = db
        .prepare('DELETE FROM blocks WHERE id = ?')
        .run(req.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    },
  );
};
