import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';

export async function requireParentPin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const supplied = req.headers['x-parent-pin'];
  if (typeof supplied !== 'string' || supplied.length === 0) {
    reply.code(401).send({ error: 'PIN required' });
    return;
  }
  const row = db.prepare('SELECT pin FROM settings WHERE id = 1').get() as
    | { pin: string }
    | undefined;
  if (!row || row.pin !== supplied) {
    reply.code(401).send({ error: 'Invalid PIN' });
    return;
  }
}

export function getStoredPin(): string {
  const row = db.prepare('SELECT pin FROM settings WHERE id = 1').get() as
    | { pin: string }
    | undefined;
  if (!row) throw new Error('settings row missing');
  return row.pin;
}

export function setStoredPin(newPin: string): void {
  db.prepare(
    "UPDATE settings SET pin = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(newPin);
}
