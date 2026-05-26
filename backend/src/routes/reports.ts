import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

interface ChildRef {
  id: number;
  name: string;
  image: string | null;
}

interface ChildDateRow {
  child_id: number;
  date: string;
  total: number;
  done: number;
}

interface ChildAggRow {
  child_id: number;
  done: number;
  total: number;
}

interface HouseholdRow {
  date: string;
  block_id: number;
  block_name: string;
  block_deadline_time: string;
  block_outcome: string | null;
  child_id: number;
  child_name: string;
  child_image: string | null;
  done: number;
  total: number;
}

function getLocalDate(): string {
  return (
    db.prepare("SELECT date('now', 'localtime') AS d").get() as { d: string }
  ).d;
}

const householdQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 365 },
  },
} as const;

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/reports/per-child', async () => {
    const children = db
      .prepare(
        'SELECT id, name, image FROM children ORDER BY display_order, name',
      )
      .all() as ChildRef[];

    const today = getLocalDate();

    const dailyRows = db
      .prepare(
        `SELECT child_id, date,
                COUNT(*) AS total,
                COALESCE(SUM(completed), 0) AS done
           FROM daily_logs
          WHERE child_id IS NOT NULL
          GROUP BY child_id, date
          ORDER BY child_id, date DESC`,
      )
      .all() as ChildDateRow[];

    const perChildDates = new Map<
      number,
      { date: string; perfect: boolean }[]
    >();
    for (const row of dailyRows) {
      const list = perChildDates.get(row.child_id) ?? [];
      list.push({
        date: row.date,
        perfect: row.total > 0 && row.done === row.total,
      });
      perChildDates.set(row.child_id, list);
    }

    function computeStreak(
      dates: { date: string; perfect: boolean }[],
    ): number {
      let streak = 0;
      for (const d of dates) {
        if (d.perfect) {
          streak++;
        } else if (d.date < today) {
          // Past-day broken; streak ends.
          break;
        }
        // Today not perfect yet — skip without breaking (in-progress).
      }
      return streak;
    }

    const weekRows = db
      .prepare(
        `SELECT child_id,
                COALESCE(SUM(completed), 0) AS done,
                COUNT(*) AS total
           FROM daily_logs
          WHERE child_id IS NOT NULL
            AND date >= date('now', 'localtime', '-6 days')
          GROUP BY child_id`,
      )
      .all() as ChildAggRow[];
    const weekMap = new Map(weekRows.map((r) => [r.child_id, r]));

    const monthRows = db
      .prepare(
        `SELECT child_id,
                COALESCE(SUM(completed), 0) AS done,
                COUNT(*) AS total
           FROM daily_logs
          WHERE child_id IS NOT NULL
            AND date >= date('now', 'localtime', '-29 days')
          GROUP BY child_id`,
      )
      .all() as ChildAggRow[];
    const monthMap = new Map(monthRows.map((r) => [r.child_id, r]));

    return children.map((c) => {
      const w = weekMap.get(c.id);
      const m = monthMap.get(c.id);
      return {
        child: c,
        streak_days: computeStreak(perChildDates.get(c.id) ?? []),
        week: {
          completed: w?.done ?? 0,
          total: w?.total ?? 0,
          rate: !w || w.total === 0 ? null : w.done / w.total,
        },
        month: {
          completed: m?.done ?? 0,
          total: m?.total ?? 0,
          rate: !m || m.total === 0 ? null : m.done / m.total,
        },
      };
    });
  });

  fastify.get<{ Querystring: { days?: number } }>(
    '/api/reports/household',
    { schema: { querystring: householdQuerystring } },
    async (req) => {
      const days = req.query.days ?? 30;

      const rows = db
        .prepare(
          `SELECT date, block_id, block_name, block_deadline_time, block_outcome,
                  child_id, child_name, child_image,
                  COALESCE(SUM(completed), 0) AS done,
                  COUNT(*) AS total
             FROM daily_logs
            WHERE child_id IS NOT NULL AND block_id IS NOT NULL
              AND date >= date('now', 'localtime', ?)
            GROUP BY date, block_id, child_id
            ORDER BY date DESC, block_deadline_time, child_name`,
        )
        .all(`-${days - 1} days`) as HouseholdRow[];

      interface DayBlockChild {
        child_id: number;
        child_name: string;
        child_image: string | null;
        done: number;
        total: number;
      }
      interface DayBlock {
        block_id: number;
        block_name: string;
        deadline_time: string;
        outcome: string | null;
        children: DayBlockChild[];
      }
      interface Day {
        date: string;
        blocks: DayBlock[];
      }

      const daysMap = new Map<string, Day>();
      for (const r of rows) {
        let day = daysMap.get(r.date);
        if (!day) {
          day = { date: r.date, blocks: [] };
          daysMap.set(r.date, day);
        }
        let block = day.blocks.find((b) => b.block_id === r.block_id);
        if (!block) {
          block = {
            block_id: r.block_id,
            block_name: r.block_name,
            deadline_time: r.block_deadline_time,
            outcome: r.block_outcome,
            children: [],
          };
          day.blocks.push(block);
        }
        block.children.push({
          child_id: r.child_id,
          child_name: r.child_name,
          child_image: r.child_image,
          done: r.done,
          total: r.total,
        });
      }

      return Array.from(daysMap.values());
    },
  );
};
