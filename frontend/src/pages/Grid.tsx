import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  api,
  type BlockState,
  type GridBlock,
  type Today,
} from '../api';
import { Celebration } from '../components/Celebration';
import { useServerClock } from '../useServerClock';

// Polling cadence for cross-tablet sync. Short enough to feel near-live, long
// enough that a household of tablets doesn't hammer the backend.
const REFRESH_INTERVAL_MS = 3000;

// Minimum gap between accepted taps on the same cell. Defends against
// rapid-fire double-taps that previously locked up the tablet — the in-flight
// guard alone wasn't synchronous enough.
const TAP_COOLDOWN_MS = 600;

function autoSelectBlockId(blocks: GridBlock[], nowHHMM: string): number | null {
  if (blocks.length === 0) return null;
  const active = blocks.find((b) => b.state === 'active');
  if (active) return active.id;
  const upcoming = blocks.find((b) => b.deadline_time >= nowHHMM);
  return (upcoming ?? blocks[blocks.length - 1]).id;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface CelebrationEvent {
  key: string;
  kidName: string;
  kidImage: string | null;
}

export function Grid() {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [gifPool, setGifPool] = useState<string[]>([]);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEvent[]>(
    [],
  );
  const [refreshing, setRefreshing] = useState(false);

  const clock = useServerClock();

  // Synchronous guards. React state can't reliably block a second tap that
  // fires in the same event loop tick — refs can.
  const pendingRef = useRef<Set<number>>(new Set());
  const lastTapAtRef = useRef<Map<number, number>>(new Map());

  const load = useCallback((opts?: { showSpinner?: boolean }) => {
    if (opts?.showSpinner) setRefreshing(true);
    return api
      .getToday()
      .then((d) => {
        setData(d);
        setActiveBlockId((current) => {
          if (current && d.blocks.some((b) => b.id === current)) return current;
          const nowHHMM = new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          return autoSelectBlockId(d.blocks, nowHHMM);
        });
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        if (opts?.showSpinner) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cross-tablet sync — poll Today on a short interval while the tab is
  // visible. Pauses while a cell is mid-flight to avoid stomping the user's
  // optimistic UI before the patch comes back.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (pendingRef.current.size > 0) return;
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Pre-fetch GIF pool once. Silent if not configured.
  useEffect(() => {
    api
      .getCelebrationGifs()
      .then(({ urls }) => setGifPool(urls))
      .catch(() => {
        /* no key / no network — celebration falls back to confetti + sound */
      });
  }, []);

  // Tablet-wake / day-rollover refetch.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Dequeue next celebration when the current one ends.
  useEffect(() => {
    if (!celebration && celebrationQueue.length > 0) {
      setCelebration(celebrationQueue[0]);
      setCelebrationQueue((q) => q.slice(1));
    }
  }, [celebration, celebrationQueue]);

  const enqueueCelebration = (event: CelebrationEvent) => {
    setCelebration((current) => {
      if (current) {
        setCelebrationQueue((q) => [...q, event]);
        return current;
      }
      return event;
    });
  };

  const toggleCell = async (
    logId: number,
    currentCompleted: boolean,
    childId: number,
  ) => {
    // Synchronous guards run before any awaits or state updates so a
    // double-tap fired in the same tick can't sneak two requests through.
    if (pendingRef.current.has(logId)) return;
    const last = lastTapAtRef.current.get(logId) ?? 0;
    const now = Date.now();
    if (now - last < TAP_COOLDOWN_MS) return;
    lastTapAtRef.current.set(logId, now);
    pendingRef.current.add(logId);

    const block =
      data?.blocks.find((b) => b.id === activeBlockId) ?? data?.blocks[0];

    // "shouldCelebrate" predicate computed BEFORE the toggle, so it ignores
    // the cell being toggled and asks: are all this kid's *other* cells in
    // this block already done?
    const next = !currentCompleted;
    let shouldCelebrate = false;
    let kid: { id: number; name: string; image: string | null } | undefined;
    if (block && next === true) {
      kid = block.children.find((c) => c.id === childId);
      const otherLogs = block.logs.filter(
        (l) => l.child_id === childId && l.id !== logId,
      );
      shouldCelebrate =
        kid != null && otherLogs.length > 0 && otherLogs.every((l) => l.completed);
    }

    setPending((s) => new Set(s).add(logId));
    setData((prev) =>
      prev
        ? {
            ...prev,
            blocks: prev.blocks.map((b) => ({
              ...b,
              logs: b.logs.map((l) =>
                l.id === logId
                  ? {
                      ...l,
                      completed: next,
                      completed_at: next ? new Date().toISOString() : null,
                    }
                  : l,
              ),
            })),
          }
        : prev,
    );
    try {
      await api.patchLog(logId, next);
      if (shouldCelebrate && kid) {
        enqueueCelebration({
          key: `${block!.id}:${kid.id}:${Date.now()}`,
          kidName: kid.name,
          kidImage: kid.image,
        });
      }
    } catch (e) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              blocks: prev.blocks.map((b) => ({
                ...b,
                logs: b.logs.map((l) =>
                  l.id === logId
                    ? {
                        ...l,
                        completed: currentCompleted,
                        completed_at: currentCompleted ? l.completed_at : null,
                      }
                    : l,
                ),
              })),
            }
          : prev,
      );
      if (e instanceof ApiError && e.status === 409) {
        load();
      } else {
        setError((e as Error).message);
      }
    } finally {
      pendingRef.current.delete(logId);
      setPending((s) => {
        const x = new Set(s);
        x.delete(logId);
        return x;
      });
    }
  };

  if (error && !data) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="rounded-2xl border border-brand-red-dark/30 bg-brand-red/30 px-6 py-4 text-body-md text-brand-red-dark">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-body-md text-stone">Loading…</div>
      </div>
    );
  }

  const { blocks, date } = data;
  const pickGif = (): string | null => {
    if (gifPool.length === 0) return null;
    return gifPool[Math.floor(Math.random() * gifPool.length)];
  };

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline-soft px-8 py-4">
        <div>
          <div className="text-h4 text-ink">Routine Grid</div>
          <div className="text-caption text-slate">{formatDate(date)}</div>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="text-h3 tabular-nums text-ink"
            aria-label="Current time"
            title={clock ? `Timezone: ${clock.timezone}` : 'Syncing time…'}
          >
            {clock?.time ?? '—:—'}
          </div>
          <button
            type="button"
            onClick={() => void load({ showSpinner: true })}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-hairline text-h5 text-slate active:bg-surface disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
            disabled={refreshing}
            style={{ touchAction: 'manipulation' }}
          >
            <span
              aria-hidden
              className={refreshing ? 'inline-block animate-spin' : ''}
            >
              ↻
            </span>
          </button>
          <Link
            to="/settings"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-hairline text-h5 text-slate active:bg-surface"
            aria-label="Parent settings"
            title="Parent settings"
            style={{ touchAction: 'manipulation' }}
          >
            ⚙
          </Link>
        </div>
      </header>

      {error && (
        <div className="mx-8 mt-4 rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
          {error}
        </div>
      )}

      {blocks.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <BlockTabs
            blocks={blocks}
            activeId={activeBlockId}
            onSelect={setActiveBlockId}
          />
          <div className="flex-1 overflow-auto px-8 pb-8">
            <Matrix
              block={blocks.find((b) => b.id === activeBlockId) ?? blocks[0]}
              pending={pending}
              onToggle={toggleCell}
            />
          </div>
        </>
      )}

      {celebration && (
        <Celebration
          key={celebration.key}
          kidName={celebration.kidName}
          kidImage={celebration.kidImage}
          gifUrl={pickGif()}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  );
}

function BlockTabs({
  blocks,
  activeId,
  onSelect,
}: {
  blocks: GridBlock[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex gap-3 border-b border-hairline-soft px-8 py-4">
      {blocks.map((b) => {
        const selected = b.id === activeId;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            style={{ touchAction: 'manipulation' }}
            className={`flex items-center gap-3 rounded-full px-6 py-3 text-button-md transition-colors ${
              selected
                ? 'bg-primary text-on-primary'
                : 'bg-canvas text-ink border border-hairline-strong active:bg-surface'
            }`}
          >
            <span className="text-h5">{b.name}</span>
            <StateChip
              state={b.state}
              start={b.start_time}
              deadline={b.deadline_time}
              inverse={selected}
            />
          </button>
        );
      })}
    </div>
  );
}

function StateChip({
  state,
  start,
  deadline,
  inverse,
}: {
  state: BlockState;
  start: string;
  deadline: string;
  inverse: boolean;
}) {
  if (state === 'active') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-caption ${
          inverse ? 'text-on-dark-muted' : 'text-stone'
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-success-accent" />
        {start} – {deadline}
      </span>
    );
  }
  if (state === 'locked-complete') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-bold ${
          inverse
            ? 'bg-on-dark/20 text-on-primary'
            : 'bg-teal-light text-moss-dark'
        }`}
      >
        ✓ complete
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-bold ${
        inverse ? 'bg-on-dark/20 text-on-primary' : 'bg-surface text-stone'
      }`}
    >
      🔒 locked
    </span>
  );
}

function Matrix({
  block,
  pending,
  onToggle,
}: {
  block: GridBlock;
  pending: Set<number>;
  onToggle: (logId: number, current: boolean, childId: number) => void;
}) {
  const isLocked =
    block.state === 'locked-complete' || block.state === 'locked-missed';
  const isMissed = block.state === 'locked-missed';

  if (block.children.length === 0 || block.tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-body-md text-stone">
          No tasks assigned in this block today.
        </p>
      </div>
    );
  }

  const cellByKey = new Map<string, { id: number; completed: boolean }>();
  for (const log of block.logs) {
    cellByKey.set(`${log.child_id}:${log.task_id}`, {
      id: log.id,
      completed: log.completed,
    });
  }

  const gridTemplate = `220px repeat(${block.tasks.length}, minmax(120px, 1fr))`;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {block.state !== 'active' && (
        <StatusBanner state={block.state} deadline={block.deadline_time} />
      )}
      <div className={`overflow-auto ${isMissed ? 'opacity-70 grayscale' : ''}`}>
        <div
          className="grid items-stretch"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div />
          {block.tasks.map((t) => (
            <div
              key={t.id}
              className="flex flex-col items-center gap-1 px-2 pb-4 text-center"
            >
              <span className="text-display-lg leading-none" aria-hidden>
                {t.emoji}
              </span>
              <span className="text-body-sm text-ink">{t.name}</span>
            </div>
          ))}

          {block.children.map((c, rowIdx) => (
            <ChildRow
              key={c.id}
              child={c}
              tasks={block.tasks}
              cellByKey={cellByKey}
              pending={pending}
              onToggle={onToggle}
              isLocked={isLocked}
              isLastRow={rowIdx === block.children.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  state,
  deadline,
}: {
  state: BlockState;
  deadline: string;
}) {
  if (state === 'locked-complete') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-brand-teal/30 bg-teal-light px-5 py-3 text-body-md text-moss-dark">
        <span aria-hidden>✓</span>
        <span>All done before {deadline} — locked in.</span>
      </div>
    );
  }
  if (state === 'locked-missed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-5 py-3 text-body-md text-charcoal">
        <span aria-hidden>🔒</span>
        <span>Locked at {deadline} — some tasks were missed.</span>
      </div>
    );
  }
  return null;
}

function ChildRow({
  child,
  tasks,
  cellByKey,
  pending,
  onToggle,
  isLocked,
  isLastRow,
}: {
  child: { id: number; name: string; image: string | null };
  tasks: { id: number; name: string; emoji: string }[];
  cellByKey: Map<string, { id: number; completed: boolean }>;
  pending: Set<number>;
  onToggle: (logId: number, current: boolean, childId: number) => void;
  isLocked: boolean;
  isLastRow: boolean;
}) {
  const rowBorder = isLastRow ? '' : 'border-b border-hairline-soft';
  return (
    <>
      <div className={`flex items-center gap-4 px-3 py-3 ${rowBorder}`}>
        {child.image ? (
          <img
            src={child.image}
            alt={child.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-light text-h3 text-yellow-dark">
            {child.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-h5 text-ink">{child.name}</span>
      </div>
      {tasks.map((t) => {
        const cell = cellByKey.get(`${child.id}:${t.id}`);
        return (
          <div
            key={t.id}
            className={`flex items-center justify-center p-2 ${rowBorder}`}
          >
            {cell ? (
              <Cell
                logId={cell.id}
                completed={cell.completed}
                isPending={pending.has(cell.id)}
                isLocked={isLocked}
                childId={child.id}
                onToggle={onToggle}
              />
            ) : (
              <div
                className="h-24 w-full rounded-2xl bg-surface-soft"
                aria-label="not assigned"
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function Cell({
  logId,
  completed,
  isPending,
  isLocked,
  childId,
  onToggle,
}: {
  logId: number;
  completed: boolean;
  isPending: boolean;
  isLocked: boolean;
  childId: number;
  onToggle: (logId: number, current: boolean, childId: number) => void;
}) {
  const cls = `flex h-24 w-full items-center justify-center rounded-2xl border-2 transition-colors ${
    completed
      ? 'border-primary bg-yellow-light text-primary'
      : 'border-hairline bg-canvas text-stone'
  } ${isPending ? 'opacity-60' : ''}`;

  if (isLocked) {
    return (
      <div className={cls} aria-pressed={completed}>
        {completed ? <CrossMark /> : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onToggle(logId, completed, childId)}
      aria-pressed={completed}
      disabled={isPending}
      className={`${cls} ${completed ? '' : 'active:bg-surface'}`}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
    >
      {completed ? <CrossMark /> : null}
    </button>
  );
}

function CrossMark() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-14 w-14"
      stroke="currentColor"
      strokeWidth="14"
      strokeLinecap="round"
      fill="none"
      aria-hidden
    >
      <path d="M22 22 L78 78" />
      <path d="M78 22 L22 78" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-md text-center">
        <h2 className="text-h2 text-ink">Nothing scheduled today</h2>
        <p className="mt-3 text-body-md text-slate">
          Open parent settings to add children, time blocks, tasks, and assign
          them.
        </p>
        <div className="mt-6">
          <Link
            to="/settings"
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-button-md text-on-primary active:bg-charcoal"
          >
            Parent settings
          </Link>
        </div>
      </div>
    </div>
  );
}
