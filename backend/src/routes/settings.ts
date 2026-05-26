import type { FastifyPluginAsync } from 'fastify';
import { getStoredPin, requireParentPin, setStoredPin } from '../auth.js';

const changePinBody = {
  type: 'object',
  required: ['current_pin', 'new_pin'],
  additionalProperties: false,
  properties: {
    current_pin: { type: 'string', pattern: '^[0-9]{4}$' },
    new_pin: { type: 'string', pattern: '^[0-9]{4}$' },
  },
} as const;

interface ChangePinBody {
  current_pin: string;
  new_pin: string;
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Body: ChangePinBody }>(
    '/api/settings/pin',
    { preHandler: requireParentPin, schema: { body: changePinBody } },
    async (req, reply) => {
      if (req.body.current_pin !== getStoredPin()) {
        return reply.code(401).send({ error: 'Current PIN incorrect' });
      }
      setStoredPin(req.body.new_pin);
      return { ok: true };
    },
  );
};
