import type { FastifyPluginAsync } from 'fastify';
import { getStoredPin } from '../auth.js';

const pinBody = {
  type: 'object',
  required: ['pin'],
  additionalProperties: false,
  properties: {
    pin: { type: 'string', pattern: '^[0-9]{4}$' },
  },
} as const;

interface VerifyBody {
  pin: string;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: VerifyBody }>(
    '/api/auth/verify-pin',
    { schema: { body: pinBody } },
    async (req, reply) => {
      if (req.body.pin !== getStoredPin()) {
        return reply.code(401).send({ error: 'Invalid PIN' });
      }
      return { ok: true };
    },
  );
};
