import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';
import { db } from '../db.js';
import type { ChildRow } from '../types.js';

const childBodyCreate = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    image: { type: ['string', 'null'], maxLength: 500 },
    display_order: { type: 'integer', minimum: 0 },
  },
} as const;

const childBodyPatch = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: childBodyCreate.properties,
} as const;

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface CreateBody {
  name: string;
  image?: string | null;
  display_order?: number;
}

interface PatchBody {
  name?: string;
  image?: string | null;
  display_order?: number;
}

export const childrenRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/children', async () => {
    return db
      .prepare('SELECT * FROM children ORDER BY display_order, id')
      .all() as ChildRow[];
  });

  fastify.get<{ Params: { id: number } }>(
    '/api/children/:id',
    { schema: { params: idParam } },
    async (req, reply) => {
      const row = db
        .prepare('SELECT * FROM children WHERE id = ?')
        .get(req.params.id) as ChildRow | undefined;
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return row;
    },
  );

  fastify.post<{ Body: CreateBody }>(
    '/api/children',
    { preHandler: requireParentPin, schema: { body: childBodyCreate } },
    async (req, reply) => {
      const { name, image = null, display_order = 0 } = req.body;
      const result = db
        .prepare(
          'INSERT INTO children (name, image, display_order) VALUES (?, ?, ?)',
        )
        .run(name, image, display_order);
      const row = db
        .prepare('SELECT * FROM children WHERE id = ?')
        .get(result.lastInsertRowid) as ChildRow;
      return reply.code(201).send(row);
    },
  );

  fastify.patch<{ Params: { id: number }; Body: PatchBody }>(
    '/api/children/:id',
    {
      preHandler: requireParentPin,
      schema: { params: idParam, body: childBodyPatch },
    },
    async (req, reply) => {
      const id = req.params.id;
      const fields: string[] = [];
      const values: unknown[] = [];
      if (req.body.name !== undefined) {
        fields.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.image !== undefined) {
        fields.push('image = ?');
        values.push(req.body.image);
      }
      if (req.body.display_order !== undefined) {
        fields.push('display_order = ?');
        values.push(req.body.display_order);
      }
      fields.push("updated_at = datetime('now')");
      values.push(id);
      const result = db
        .prepare(`UPDATE children SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return db
        .prepare('SELECT * FROM children WHERE id = ?')
        .get(id) as ChildRow;
    },
  );

  fastify.delete<{ Params: { id: number } }>(
    '/api/children/:id',
    { preHandler: requireParentPin, schema: { params: idParam } },
    async (req, reply) => {
      const result = db
        .prepare('DELETE FROM children WHERE id = ?')
        .run(req.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    },
  );
};
