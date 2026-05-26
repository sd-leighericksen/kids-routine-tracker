import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyPluginAsync } from 'fastify';
import { requireParentPin } from '../auth.js';

const here = dirname(fileURLToPath(import.meta.url));
export const uploadsDir = resolve(here, '../../data/uploads');
mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/uploads',
    { preHandler: requireParentPin },
    async (req, reply) => {
      const file = await req.file();
      if (!file) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }
      const buffer = await file.toBuffer();
      const ext = extname(file.filename).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return reply.code(400).send({
          error: `Unsupported file type ${ext || '(none)'}; allowed: ${[
            ...ALLOWED_EXT,
          ].join(', ')}`,
        });
      }
      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
      const filename = `${hash}${ext}`;
      writeFileSync(resolve(uploadsDir, filename), buffer);
      return { url: `/uploads/${filename}` };
    },
  );
};
