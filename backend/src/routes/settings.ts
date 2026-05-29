import type { FastifyPluginAsync } from 'fastify';
import { getStoredPin, requireParentPin, setStoredPin } from '../auth.js';
import {
  getClockStatus,
  getStoredTimezone,
  isValidTimezone,
  setStoredTimezone,
  syncTime,
} from '../time.js';

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

const timezoneBody = {
  type: 'object',
  required: ['timezone'],
  additionalProperties: false,
  properties: {
    timezone: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;

interface TimezoneBody {
  timezone: string;
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

  // Public — driving the kid-facing clock shouldn't need a PIN.
  fastify.get('/api/clock', async () => getClockStatus());

  fastify.get('/api/settings/timezone', async () => ({
    timezone: getStoredTimezone(),
  }));

  fastify.patch<{ Body: TimezoneBody }>(
    '/api/settings/timezone',
    { preHandler: requireParentPin, schema: { body: timezoneBody } },
    async (req, reply) => {
      if (!isValidTimezone(req.body.timezone)) {
        return reply.code(400).send({ error: 'Invalid timezone' });
      }
      setStoredTimezone(req.body.timezone);
      // Re-sync immediately so the new tz is reflected with up-to-date offset.
      void syncTime();
      return { timezone: getStoredTimezone() };
    },
  );
};
