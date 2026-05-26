import { useEffect, useState } from 'react';
import {
  api,
  type HouseholdDay,
  type HouseholdDayBlock,
  type PerChildReport,
} from '../../api';

const WINDOW_CHOICES = [7, 30, 90] as const;
type Window = (typeof WINDOW_CHOICES)[number];

export function ReportsPanel() {
  const [perChild, setPerChild] = useState<PerChildReport[] | null>(null);
  const [household, setHousehold] = useState<HouseholdDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<Window>(30);

  useEffect(() => {
    setError(null);
    Promise.all([api.getReportPerChild(), api.getReportHousehold(windowDays)])
      .then(([pc, h]) => {
        setPerChild(pc);
        setHousehold(h);
      })
      .catch((e: Error) => setError(e.message));
  }, [windowDays]);

  if (error) {
    return (
      <div className="rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
        {error}
      </div>
    );
  }
  if (!perChild || !household) {
    return <div className="text-body-md text-stone">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h2 className="text-h3 text-ink">Reports</h2>
        <p className="text-body-sm text-slate">
          Read straight from the immutable daily logs. Streaks count consecutive
          days where every assigned task was completed before deadline; today's
          in-progress state is skipped, not penalised.
        </p>
      </header>

      <PerChildGrid reports={perChild} />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-h4 text-ink">Household day log</h3>
          <WindowToggle value={windowDays} onChange={setWindowDays} />
        </div>
        {household.length === 0 ? (
          <div className="rounded-2xl border border-hairline-soft bg-canvas p-8 text-center text-body-md text-stone">
            No log entries in the last {windowDays} days yet.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {household.map((day) => (
              <DayCard key={day.date} day={day} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PerChildGrid({ reports }: { reports: PerChildReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline-soft bg-canvas p-8 text-center text-body-md text-stone">
        No children yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {reports.map((r) => (
        <PerChildCard key={r.child.id} report={r} />
      ))}
    </div>
  );
}

function PerChildCard({ report }: { report: PerChildReport }) {
  const { child, streak_days, week, month } = report;
  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-hairline-soft bg-canvas p-5 shadow-elev-1">
      <header className="flex items-center gap-4">
        {child.image ? (
          <img
            src={child.image}
            alt={child.name}
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-light text-h4 text-yellow-dark">
            {child.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-h5 text-ink">{child.name}</div>
          <div className="text-caption text-slate">
            {streak_days === 0
              ? 'No streak yet'
              : `${streak_days} day${streak_days === 1 ? '' : 's'} streak 🔥`}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Last 7 days" agg={week} />
        <Stat label="Last 30 days" agg={month} />
      </div>
    </article>
  );
}

function Stat({
  label,
  agg,
}: {
  label: string;
  agg: { completed: number; total: number; rate: number | null };
}) {
  return (
    <div className="rounded-xl bg-surface-soft p-3">
      <div className="text-micro-uppercase uppercase text-steel">{label}</div>
      <div className="mt-1 text-h3 text-ink">
        {agg.rate == null ? '—' : `${Math.round(agg.rate * 100)}%`}
      </div>
      <div className="text-caption text-stone">
        {agg.completed}/{agg.total} tasks
      </div>
    </div>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: Window;
  onChange: (v: Window) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface p-1">
      {WINDOW_CHOICES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`rounded-full px-3 py-1 text-button-md transition-colors ${
            value === d
              ? 'bg-primary text-on-primary'
              : 'text-slate active:bg-canvas'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function DayCard({ day }: { day: HouseholdDay }) {
  return (
    <article className="rounded-2xl border border-hairline-soft bg-canvas p-5 shadow-elev-1">
      <header className="mb-3 flex items-baseline justify-between">
        <h4 className="text-h5 text-ink">{formatDate(day.date)}</h4>
        <span className="text-caption text-stone">{day.date}</span>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {day.blocks.map((b) => (
          <BlockBreakdown key={b.block_id} block={b} />
        ))}
      </div>
    </article>
  );
}

function BlockBreakdown({ block }: { block: HouseholdDayBlock }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline-soft p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-body-md font-medium text-ink">
            {block.block_name}
          </div>
          <div className="text-caption text-slate">
            deadline {block.deadline_time}
          </div>
        </div>
        <OutcomeChip outcome={block.outcome} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {block.children.map((c) => {
          const done = c.done >= c.total && c.total > 0;
          return (
            <li
              key={c.child_id}
              className="flex items-center gap-2 text-body-sm"
            >
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  done ? 'bg-success-accent' : 'bg-hairline-strong'
                }`}
              />
              <span className="flex-1 text-ink">{c.child_name}</span>
              <span className="text-caption text-stone">
                {c.done}/{c.total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: string | null }) {
  if (outcome === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-light px-2 py-0.5 text-caption-bold text-moss-dark">
        ✓ complete
      </span>
    );
  }
  if (outcome === 'missed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-caption-bold text-stone">
        🔒 missed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-caption-bold text-slate">
      <span className="h-1.5 w-1.5 rounded-full bg-success-accent" />
      active
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
