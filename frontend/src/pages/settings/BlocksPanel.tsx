import { useEffect, useState } from 'react';
import { api, type Block } from '../../api';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { TextInput } from '../../components/TextInput';
import { useToast } from '../../components/Toast';

interface DraftState {
  id: number | null;
  name: string;
  start_time: string;
  deadline_time: string;
}

const emptyDraft: DraftState = {
  id: null,
  name: '',
  start_time: '06:00',
  deadline_time: '08:00',
};

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function BlocksPanel() {
  const toast = useToast();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Block | null>(null);

  const refresh = () => {
    api
      .listBlocks()
      .then(setBlocks)
      .catch((e: Error) => toast.show(e.message, 'error'));
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => {
    setDraft(emptyDraft);
    setDraftError(null);
    setSheetOpen(true);
  };

  const startEdit = (b: Block) => {
    setDraft({
      id: b.id,
      name: b.name,
      start_time: b.start_time,
      deadline_time: b.deadline_time,
    });
    setDraftError(null);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setDraftError('Name is required');
      return;
    }
    if (!TIME_RE.test(draft.start_time)) {
      setDraftError('Start time must be in HH:MM 24-hour format');
      return;
    }
    if (!TIME_RE.test(draft.deadline_time)) {
      setDraftError('End time must be in HH:MM 24-hour format');
      return;
    }
    if (draft.start_time >= draft.deadline_time) {
      setDraftError('End time must be later than start time');
      return;
    }
    setSaving(true);
    try {
      if (draft.id == null) {
        await api.createBlock({
          name: draft.name.trim(),
          start_time: draft.start_time,
          deadline_time: draft.deadline_time,
        });
        toast.show('Block added', 'success');
      } else {
        await api.updateBlock(draft.id, {
          name: draft.name.trim(),
          start_time: draft.start_time,
          deadline_time: draft.deadline_time,
        });
        toast.show('Block updated', 'success');
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
    const b = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteBlock(b.id);
      toast.show(`Deleted ${b.name}`, 'success');
      refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-ink">Time blocks</h2>
          <p className="text-body-sm text-slate">
            {blocks?.length ?? 0} {blocks?.length === 1 ? 'block' : 'blocks'}
          </p>
        </div>
        <Button onClick={startAdd} size="lg">+ Add block</Button>
      </header>

      {blocks == null ? (
        <div className="text-body-md text-stone">Loading…</div>
      ) : blocks.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-4 rounded-2xl border border-hairline-soft bg-canvas p-4 shadow-elev-1"
            >
              <div className="flex-1">
                <div className="text-body-md text-ink">{b.name}</div>
                <div className="text-caption text-slate">
                  {b.start_time} – {b.deadline_time}
                </div>
              </div>
              <span className="rounded-full bg-surface px-3 py-1 text-caption-bold text-charcoal">
                {b.start_time} → {b.deadline_time}
              </span>
              <Button variant="secondary" onClick={() => startEdit(b)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setPendingDelete(b)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={draft.id == null ? 'Add time block' : 'Edit time block'}
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
          <TextInput
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Morning"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="Start time"
              type="time"
              value={draft.start_time}
              onChange={(e) =>
                setDraft((d) => ({ ...d, start_time: e.target.value }))
              }
              hint="When this block opens"
            />
            <TextInput
              label="End time"
              type="time"
              value={draft.deadline_time}
              onChange={(e) =>
                setDraft((d) => ({ ...d, deadline_time: e.target.value }))
              }
              hint="Deadline — block locks at this time"
            />
          </div>
          {draftError && (
            <p className="text-caption text-brand-red-dark">{draftError}</p>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete time block?"
        body={
          pendingDelete
            ? `Delete ${pendingDelete.name}? Past logs keep this block's name, start time, and end time. Current assignments in ${pendingDelete.name} are removed; future days won't include this block.`
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
        ⏰
      </div>
      <div>
        <p className="text-h5 text-ink">No time blocks yet</p>
        <p className="mt-1 text-body-sm text-slate">
          Add a morning, afternoon, or whatever rhythm you want — each block has its own start and end.
        </p>
      </div>
      <Button size="lg" onClick={onAdd}>+ Add your first block</Button>
    </div>
  );
}
