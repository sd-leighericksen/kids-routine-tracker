import { db } from './db.js';
import {
  recordAndDeliver,
  type BlockDeadlineMissedEvent,
} from './webhooks.js';

export function getLocalDate(): string {
  return (
    db.prepare("SELECT date('now', 'localtime') AS d").get() as { d: string }
  ).d;
}

interface LocalDateTime {
  date: string;
  time: string;
}

function getLocalDateTime(): LocalDateTime {
  const row = db
    .prepare(
      "SELECT date('now', 'localtime') AS d, strftime('%H:%M', 'now', 'localtime') AS t",
    )
    .get() as { d: string; t: string };
  return { date: row.d, time: row.t };
}

// Snapshot of all current assignments into daily_logs for the date.
// Idempotent: protected by daily_snapshots so the grid is frozen at first
// load — assignment edits made later in the day affect future days only.
export const ensureSnapshot = db.transaction((date: string) => {
  const exists = db
    .prepare('SELECT 1 FROM daily_snapshots WHERE date = ?')
    .get(date);
  if (exists) return;

  db.prepare(
    `INSERT OR IGNORE INTO daily_logs
       (date, block_id, block_name, block_deadline_time,
        child_id, child_name, child_image,
        task_id, task_name, task_emoji,
        completed)
     SELECT
        ?, b.id, b.name, b.deadline_time,
        c.id, c.name, c.image,
        t.id, t.name, t.emoji,
        0
     FROM assignments a
     JOIN blocks b ON b.id = a.block_id
     JOIN children c ON c.id = a.child_id
     JOIN tasks t ON t.id = a.task_id`,
  ).run(date);

  db.prepare('INSERT INTO daily_snapshots (date) VALUES (?)').run(date);
});

export interface FinalizedBlock {
  date: string;
  block_id: number;
  block_name: string;
  block_deadline_time: string;
  outcome: 'complete' | 'missed';
}

interface MissedRow {
  child_id: number;
  child_name: string;
  child_image: string | null;
  task_id: number;
  task_name: string;
  task_emoji: string;
}

// For each (date, block) with logs and no outcome yet, if the deadline has
// passed, set block_outcome on every log in that block. block.deadline_missed
// fires for any block whose new outcome is 'missed' (no event for complete).
// Comparison uses the *frozen* block_deadline_time on the log row, not the
// current blocks.deadline_time, so editing a block's deadline mid-day cannot
// retroactively unlock or lock today's grid.
export function finalizeDueBlocks(date: string): FinalizedBlock[] {
  const { date: today, time: nowHHMM } = getLocalDateTime();
  if (date > today) return [];

  const candidates = db
    .prepare(
      `SELECT DISTINCT block_id, block_name, block_deadline_time
       FROM daily_logs
       WHERE date = ? AND block_id IS NOT NULL AND block_outcome IS NULL`,
    )
    .all(date) as {
    block_id: number;
    block_name: string;
    block_deadline_time: string;
  }[];

  const finalized: FinalizedBlock[] = [];

  for (const c of candidates) {
    const deadlinePassed =
      date < today || (date === today && nowHHMM >= c.block_deadline_time);
    if (!deadlinePassed) continue;

    const stats = db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
         FROM daily_logs WHERE date = ? AND block_id = ?`,
      )
      .get(date, c.block_id) as { total: number; done: number };

    const outcome: 'complete' | 'missed' =
      stats.total > 0 && stats.done === stats.total ? 'complete' : 'missed';

    db.prepare(
      `UPDATE daily_logs SET block_outcome = ? WHERE date = ? AND block_id = ?`,
    ).run(outcome, date, c.block_id);

    finalized.push({
      date,
      block_id: c.block_id,
      block_name: c.block_name,
      block_deadline_time: c.block_deadline_time,
      outcome,
    });

    if (outcome === 'missed') {
      const missed = db
        .prepare(
          `SELECT child_id, child_name, child_image,
                  task_id, task_name, task_emoji
           FROM daily_logs
           WHERE date = ? AND block_id = ? AND completed = 0`,
        )
        .all(date, c.block_id) as MissedRow[];

      const event: BlockDeadlineMissedEvent = {
        type: 'block.deadline_missed',
        timestamp: new Date().toISOString(),
        date,
        block: {
          id: c.block_id,
          name: c.block_name,
          deadline_time: c.block_deadline_time,
        },
        missed: missed.map((m) => ({
          child: { id: m.child_id, name: m.child_name, image: m.child_image },
          task: { id: m.task_id, name: m.task_name, emoji: m.task_emoji },
        })),
      };
      recordAndDeliver(event);
    }
  }

  return finalized;
}
