import { db } from './db.js';
import {
  ensureSnapshot,
  finalizeDueBlocks,
  getLocalDate,
} from './lifecycle.js';
import {
  isApproachingDeduped,
  recordAndDeliver,
  type BlockDeadlineApproachingEvent,
} from './webhooks.js';

const TICK_MS = 60_000;

function approachingMinutes(): number {
  const raw = process.env.WEBHOOK_APPROACH_MINUTES;
  if (!raw) return 15;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function getLocalHHMM(): string {
  return (
    db.prepare("SELECT strftime('%H:%M', 'now', 'localtime') AS t").get() as {
      t: string;
    }
  ).t;
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  // Clamp to 23:59 so a wrap-around past midnight doesn't pull tomorrow's
  // blocks into today's approaching window.
  if (total >= 24 * 60) return '23:59';
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function yesterday(today: string): string {
  return (
    db.prepare("SELECT date(?, '-1 day') AS d").get(today) as { d: string }
  ).d;
}

interface IncompleteRow {
  child_id: number;
  child_name: string;
  child_image: string | null;
  task_id: number;
  task_name: string;
  task_emoji: string;
}

function fireApproachingForDate(date: string, windowMinutes: number): void {
  const now = getLocalHHMM();
  const windowEnd = addMinutesToHHMM(now, windowMinutes);

  const candidates = db
    .prepare(
      `SELECT DISTINCT block_id, block_name, block_deadline_time
       FROM daily_logs
       WHERE date = ?
         AND block_id IS NOT NULL
         AND block_outcome IS NULL
         AND block_deadline_time > ?
         AND block_deadline_time <= ?`,
    )
    .all(date, now, windowEnd) as {
    block_id: number;
    block_name: string;
    block_deadline_time: string;
  }[];

  for (const c of candidates) {
    if (isApproachingDeduped(date, c.block_id)) continue;

    const incomplete = db
      .prepare(
        `SELECT child_id, child_name, child_image,
                task_id, task_name, task_emoji
         FROM daily_logs
         WHERE date = ? AND block_id = ? AND completed = 0`,
      )
      .all(date, c.block_id) as IncompleteRow[];

    const event: BlockDeadlineApproachingEvent = {
      type: 'block.deadline_approaching',
      timestamp: new Date().toISOString(),
      date,
      block: {
        id: c.block_id,
        name: c.block_name,
        deadline_time: c.block_deadline_time,
      },
      minutes_to_deadline: windowMinutes,
      incomplete: incomplete.map((r) => ({
        child: { id: r.child_id, name: r.child_name, image: r.child_image },
        task: { id: r.task_id, name: r.task_name, emoji: r.task_emoji },
      })),
    };
    recordAndDeliver(event);
  }
}

export function tick(): void {
  try {
    const today = getLocalDate();
    ensureSnapshot(today);
    fireApproachingForDate(today, approachingMinutes());
    finalizeDueBlocks(today);
    // Catch up overnight: a tablet asleep at midnight wouldn't have
    // finalised yesterday's blocks.
    finalizeDueBlocks(yesterday(today));
  } catch (err) {
    console.error('[scheduler] tick error', err);
  }
}

let interval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (interval) return;
  tick();
  interval = setInterval(tick, TICK_MS);
  console.log(`[scheduler] started (every ${TICK_MS / 1000}s)`);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
    console.log('[scheduler] stopped');
  }
}
