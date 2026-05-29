import { db } from './db.js';

interface ChildRef {
  id: number;
  name: string;
  image: string | null;
}

interface BlockRef {
  id: number;
  name: string;
  deadline_time: string;
}

interface TaskRef {
  id: number;
  name: string;
  emoji: string;
}

interface BaseEvent {
  timestamp: string;
  date: string;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: 'task.completed';
  child: ChildRef;
  block: BlockRef;
  task: TaskRef;
  log_id: number;
}

export interface ChildAllCompleteEvent extends BaseEvent {
  type: 'child.all_complete';
  child: ChildRef;
  block: BlockRef;
  tasks: TaskRef[];
}

export interface BlockDeadlineApproachingEvent extends BaseEvent {
  type: 'block.deadline_approaching';
  block: BlockRef;
  minutes_to_deadline: number;
  incomplete: { child: ChildRef; task: TaskRef }[];
}

export interface BlockDeadlineMissedEvent extends BaseEvent {
  type: 'block.deadline_missed';
  block: BlockRef;
  missed: { child: ChildRef; task: TaskRef }[];
}

export interface WebhookTestEvent extends BaseEvent {
  type: 'webhook.test';
  message: string;
}

export type WebhookEvent =
  | TaskCompletedEvent
  | ChildAllCompleteEvent
  | BlockDeadlineApproachingEvent
  | BlockDeadlineMissedEvent
  | WebhookTestEvent;

interface SettingsRow {
  webhook_urls: string | null;
}

export function getStoredWebhookUrls(): string[] {
  const row = db
    .prepare('SELECT webhook_urls FROM settings WHERE id = 1')
    .get() as SettingsRow | undefined;
  return parseUrlList(row?.webhook_urls ?? null);
}

export function setStoredWebhookUrls(urls: string[]): string[] {
  const cleaned = urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  for (const u of cleaned) {
    if (!isValidWebhookUrl(u)) {
      throw new Error(`Invalid webhook URL: ${u}`);
    }
  }
  db.prepare(
    "UPDATE settings SET webhook_urls = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(cleaned.length === 0 ? null : cleaned.join('\n'));
  return cleaned;
}

export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseUrlList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

function getTargets(): string[] {
  const fromDb = getStoredWebhookUrls();
  const fromEnv = parseUrlList(process.env.WEBHOOK_URL ?? null);
  // De-dup while preserving order — DB entries first so the UI is the source
  // of truth and an env var added long ago can't silently double-fire.
  return Array.from(new Set([...fromDb, ...fromEnv]));
}

export function isApproachingDeduped(
  date: string,
  block_id: number,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM webhook_events
        WHERE event = 'block.deadline_approaching'
          AND date = ? AND block_id = ?
        LIMIT 1`,
    )
    .get(date, block_id);
  return !!row;
}

interface EventLocators {
  date?: string | null;
  block?: { id: number } | null;
  child?: { id: number } | null;
  task?: { id: number } | null;
  log_id?: number | null;
}

export function recordAndDeliver(event: WebhookEvent): void {
  const loc = event as unknown as EventLocators;
  const insert = db
    .prepare(
      `INSERT INTO webhook_events
         (event, date, block_id, child_id, task_id, log_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.type,
      event.date ?? null,
      loc.block?.id ?? null,
      loc.child?.id ?? null,
      loc.task?.id ?? null,
      loc.log_id ?? null,
      JSON.stringify(event),
    );
  const eventId = Number(insert.lastInsertRowid);

  const targets = getTargets();
  if (targets.length === 0) {
    console.log(
      `[webhook] ${event.type} (id=${eventId}) recorded; no WEBHOOK_URL configured.`,
    );
    return;
  }

  for (const url of targets) {
    void deliver(eventId, url, event);
  }
}

export interface RecentWebhookEvent {
  id: number;
  event: string;
  created_at: string;
  delivered: boolean;
  attempts: number;
  last_error: string | null;
  delivered_at: string | null;
}

export function getRecentWebhookEvents(limit = 20): RecentWebhookEvent[] {
  const rows = db
    .prepare(
      `SELECT id, event, created_at, delivered, attempts, last_error, delivered_at
       FROM webhook_events
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(limit) as {
    id: number;
    event: string;
    created_at: string;
    delivered: number;
    attempts: number;
    last_error: string | null;
    delivered_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    created_at: r.created_at,
    delivered: !!r.delivered,
    attempts: r.attempts,
    last_error: r.last_error,
    delivered_at: r.delivered_at,
  }));
}

export function sendTestEvent(): {
  delivered_to: number;
  event_id: number | null;
} {
  const targets = getTargets();
  const event: WebhookTestEvent = {
    type: 'webhook.test',
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    message:
      'Test ping from the kids routine tracker. If you can read this, your webhook is wired up correctly.',
  };
  // recordAndDeliver also fires-and-forgets the HTTP POST per target.
  const beforeId = db
    .prepare('SELECT MAX(id) AS m FROM webhook_events')
    .get() as { m: number | null };
  recordAndDeliver(event);
  const afterId = db
    .prepare('SELECT MAX(id) AS m FROM webhook_events')
    .get() as { m: number | null };
  return {
    delivered_to: targets.length,
    event_id: afterId.m && afterId.m !== beforeId.m ? afterId.m : null,
  };
}

async function deliver(
  eventId: number,
  url: string,
  event: WebhookEvent,
): Promise<void> {
  try {
    db.prepare('UPDATE webhook_events SET attempts = attempts + 1 WHERE id = ?').run(
      eventId,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    db.prepare(
      `UPDATE webhook_events
         SET delivered = 1,
             delivered_at = datetime('now'),
             last_error = NULL
       WHERE id = ?`,
    ).run(eventId);
    console.log(`[webhook] delivered ${event.type} → ${url} (id=${eventId})`);
  } catch (err) {
    const msg = (err as Error).message;
    db.prepare('UPDATE webhook_events SET last_error = ? WHERE id = ?').run(
      msg,
      eventId,
    );
    console.warn(`[webhook] FAILED ${event.type} → ${url}: ${msg}`);
  }
}
