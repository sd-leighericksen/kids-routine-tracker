import { useEffect, useState } from 'react';
import { api, type Task } from '../../api';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { TextInput } from '../../components/TextInput';
import { useToast } from '../../components/Toast';

interface DraftState {
  id: number | null;
  name: string;
  emoji: string;
}

const emptyDraft: DraftState = { id: null, name: '', emoji: '⭐' };

const EMOJI_PALETTE = [
  '🪥',
  '👕',
  '🛏️',
  '🥣',
  '🎒',
  '🧹',
  '📚',
  '🚿',
  '🦷',
  '🥛',
  '🍎',
  '🐶',
  '🐱',
  '⚽',
  '🎨',
  '📖',
  '🚴',
  '🏃',
  '🎵',
  '🛁',
];

export function TasksPanel() {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const refresh = () => {
    api
      .listTasks()
      .then(setTasks)
      .catch((e: Error) => toast.show(e.message, 'error'));
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => {
    setDraft(emptyDraft);
    setDraftError(null);
    setSheetOpen(true);
  };

  const startEdit = (t: Task) => {
    setDraft({ id: t.id, name: t.name, emoji: t.emoji });
    setDraftError(null);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setDraftError('Name is required');
      return;
    }
    if (!draft.emoji.trim()) {
      setDraftError('Emoji is required');
      return;
    }
    setSaving(true);
    try {
      if (draft.id == null) {
        await api.createTask({
          name: draft.name.trim(),
          emoji: draft.emoji.trim(),
        });
        toast.show('Task added', 'success');
      } else {
        await api.updateTask(draft.id, {
          name: draft.name.trim(),
          emoji: draft.emoji.trim(),
        });
        toast.show('Task updated', 'success');
      }
      setSheetOpen(false);
      refresh();
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const t = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteTask(t.id);
      toast.show(`Deleted ${t.name}`, 'success');
      refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-ink">Tasks</h2>
          <p className="text-body-sm text-slate">
            {tasks?.length ?? 0} {tasks?.length === 1 ? 'task' : 'tasks'}
          </p>
        </div>
        <Button onClick={startAdd} size="lg">+ Add task</Button>
      </header>

      {tasks == null ? (
        <div className="text-body-md text-stone">Loading…</div>
      ) : tasks.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-4 rounded-2xl border border-hairline-soft bg-canvas p-4 shadow-elev-1"
            >
              <span className="text-h3" aria-hidden>
                {t.emoji}
              </span>
              <div className="flex-1 text-body-md text-ink">{t.name}</div>
              <Button variant="secondary" size="sm" onClick={() => startEdit(t)}>
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setPendingDelete(t)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={draft.id == null ? 'Add task' : 'Edit task'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface text-h2">
              {draft.emoji || '?'}
            </div>
            <div className="flex-1">
              <TextInput
                label="Emoji"
                value={draft.emoji}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, emoji: e.target.value }))
                }
                placeholder="Paste or pick one"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-body-sm font-medium text-ink">
              Quick pick
            </div>
            <div className="flex flex-wrap gap-2">
              {EMOJI_PALETTE.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, emoji: emo }))}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl text-h4 border transition-colors ${
                    draft.emoji === emo
                      ? 'border-brand-blue bg-surface-pricing-featured'
                      : 'border-hairline-soft bg-canvas active:bg-surface'
                  }`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>

          <TextInput
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Brush teeth"
          />

          {draftError && (
            <p className="text-caption text-brand-red-dark">{draftError}</p>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete task?"
        body={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Past logs keep its name and emoji. Current assignments using this task are removed; future days won't include it.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-hairline-soft bg-canvas p-12 text-center shadow-elev-1">
      <div className="text-h2" aria-hidden>
        ✨
      </div>
      <div>
        <p className="text-h5 text-ink">No tasks yet</p>
        <p className="mt-1 text-body-sm text-slate">
          Tasks are the building blocks you assign to kids in each time block.
        </p>
      </div>
      <Button size="lg" onClick={onAdd}>+ Add your first task</Button>
    </div>
  );
}
