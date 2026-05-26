import { useEffect, useMemo, useState } from 'react';
import { api, type Assignment, type Block, type Child, type Task } from '../../api';

interface Data {
  children: Child[];
  blocks: Block[];
  tasks: Task[];
  assignments: Assignment[];
}

export function AssignmentsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const refresh = () => {
    Promise.all([
      api.listChildren(),
      api.listBlocks(),
      api.listTasks(),
      api.listAssignments(),
    ])
      .then(([children, blocks, tasks, assignments]) => {
        setData({ children, blocks, tasks, assignments });
        setActiveBlockId((current) => {
          if (current && blocks.some((b) => b.id === current)) return current;
          return blocks[0]?.id ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(refresh, []);

  const assignmentMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.assignments.forEach((a) => {
      m.set(`${a.block_id}:${a.child_id}:${a.task_id}`, a.id);
    });
    return m;
  }, [data]);

  if (error) {
    return (
      <div className="rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-body-md text-stone">Loading…</div>;
  }

  const { children, blocks, tasks } = data;

  if (blocks.length === 0 || children.length === 0 || tasks.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h2 className="text-h3 text-ink">Assignments</h2>
        </header>
        <div className="rounded-2xl border border-hairline-soft bg-canvas p-8 text-center">
          <p className="text-body-md text-stone">
            You need at least one child, one block, and one task before you can
            assign anything.
          </p>
        </div>
      </div>
    );
  }

  const activeBlock = blocks.find((b) => b.id === activeBlockId) ?? blocks[0];

  const toggle = async (childId: number, taskId: number) => {
    const key = `${activeBlock.id}:${childId}:${taskId}`;
    const existing = assignmentMap.get(key);
    setPendingKey(key);
    try {
      if (existing) {
        await api.deleteAssignment(existing);
      } else {
        await api.createAssignment({
          block_id: activeBlock.id,
          child_id: childId,
          task_id: taskId,
        });
      }
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-ink">Assignments</h2>
          <p className="text-body-sm text-slate">
            Tap a cell to assign or unassign a task. Changes apply to future days
            only.
          </p>
        </div>
      </header>

      <div className="flex gap-2">
        {blocks.map((b) => {
          const active = b.id === activeBlock.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBlockId(b.id)}
              className={`rounded-full px-5 py-2 text-button-md transition-colors ${
                active
                  ? 'bg-primary text-on-primary'
                  : 'bg-canvas text-ink border border-hairline-strong active:bg-surface'
              }`}
            >
              {b.name}
              <span className={`ml-2 text-caption ${active ? 'text-on-dark-muted' : 'text-stone'}`}>
                {b.deadline_time}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-auto rounded-2xl border border-hairline-soft bg-canvas shadow-elev-1">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-10 bg-canvas px-4 py-3 text-left text-caption-bold text-steel border-b border-hairline-soft">
                Child ↓ / Task →
              </th>
              {tasks.map((t) => (
                <th
                  key={t.id}
                  className="bg-canvas px-3 py-3 text-center text-caption-bold text-steel border-b border-hairline-soft min-w-[112px]"
                >
                  <div className="text-h4" aria-hidden>{t.emoji}</div>
                  <div className="mt-1 text-caption text-charcoal">
                    {t.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id} className="border-t border-hairline-soft">
                <td className="sticky left-0 z-10 bg-canvas px-4 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    {c.image ? (
                      <img
                        src={c.image}
                        alt={c.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-light text-body-sm text-yellow-dark">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-body-md text-ink">{c.name}</span>
                  </div>
                </td>
                {tasks.map((t) => {
                  const key = `${activeBlock.id}:${c.id}:${t.id}`;
                  const checked = assignmentMap.has(key);
                  const pending = pendingKey === key;
                  return (
                    <td
                      key={t.id}
                      className="px-3 py-3 text-center align-middle"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.id, t.id)}
                        disabled={pending}
                        aria-pressed={checked}
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
                          checked
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-hairline bg-canvas text-stone active:bg-surface'
                        } ${pending ? 'opacity-50' : ''}`}
                      >
                        {checked ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
