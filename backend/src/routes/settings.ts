import type { FastifyPluginAsync } from 'fastify';
import { getStoredPin, requireParentPin, setStoredPin } from '../auth.js';
import {
  getClockStatus,
  getStoredTimezone,
  isValidTimezone,
  setStoredTimezone,
  syncTime,
} from '../time.js';
import {
  getRecentWebhookEvents,
  getStoredWebhookUrls,
  isValidWebhookUrl,
  sendTestEvent,
  setStoredWebhookUrls,
} from '../webhooks.js';

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

const webhookUrlsBody = {
  type: 'object',
  required: ['urls'],
  additionalProperties: false,
  properties: {
    urls: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 2048 },
    },
  },
} as const;

interface WebhookUrlsBody {
  urls: string[];
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

  // Webhook configuration — PIN-gated. The settings page calls the GET form,
  // so we keep response payloads small.
  fastify.get(
    '/api/settings/webhooks',
    { preHandler: requireParentPin },
    async () => ({
      urls: getStoredWebhookUrls(),
      env_urls: parseEnvUrls(),
      recent: getRecentWebhookEvents(20),
    }),
  );

  fastify.patch<{ Body: WebhookUrlsBody }>(
    '/api/settings/webhooks',
    { preHandler: requireParentPin, schema: { body: webhookUrlsBody } },
    async (req, reply) => {
      for (const u of req.body.urls) {
        if (!isValidWebhookUrl(u)) {
          return reply
            .code(400)
            .send({ error: `Invalid webhook URL: ${u}` });
        }
      }
      try {
        const saved = setStoredWebhookUrls(req.body.urls);
        return { urls: saved };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  fastify.post(
    '/api/settings/webhooks/test',
    { preHandler: requireParentPin },
    async () => sendTestEvent(),
  );
};

function parseEnvUrls(): string[] {
  const raw = process.env.WEBHOOK_URL ?? '';
  return raw
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}
