import { useEffect, useRef, useState } from 'react';
import { api, type Child } from '../../api';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { TextInput } from '../../components/TextInput';
import { useToast } from '../../components/Toast';

interface DraftState {
  id: number | null;
  name: string;
  image: string | null;
}

const emptyDraft: DraftState = { id: null, name: '', image: null };

export function ChildrenPanel() {
  const toast = useToast();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Child | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    api
      .listChildren()
      .then(setChildren)
      .catch((e: Error) => toast.show(e.message, 'error'));
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => {
    setDraft(emptyDraft);
    setDraftError(null);
    setSheetOpen(true);
  };

  const startEdit = (c: Child) => {
    setDraft({ id: c.id, name: c.name, image: c.image });
    setDraftError(null);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setDraftError('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (draft.id == null) {
        await api.createChild({ name: draft.name.trim(), image: draft.image });
        toast.show('Child added', 'success');
      } else {
        await api.updateChild(draft.id, {
          name: draft.name.trim(),
          image: draft.image,
        });
        toast.show('Child updated', 'success');
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
    const c = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteChild(c.id);
      toast.show(`Deleted ${c.name}`, 'success');
      refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setDraft((d) => ({ ...d, image: url }));
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-ink">Children</h2>
          <p className="text-body-sm text-slate">
            {children?.length ?? 0} {children?.length === 1 ? 'child' : 'children'}
          </p>
        </div>
        <Button onClick={startAdd} size="lg">+ Add child</Button>
      </header>

      {children == null ? (
        <div className="text-body-md text-stone">Loading…</div>
      ) : children.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : (
        <ul className="flex flex-col gap-3">
          {children.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-4 rounded-2xl border border-hairline-soft bg-canvas p-4 shadow-elev-1"
            >
              <Avatar src={c.image} name={c.name} />
              <div className="flex-1 text-body-md text-ink">{c.name}</div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => startEdit(c)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setPendingDelete(c)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={draft.id == null ? 'Add child' : 'Edit child'}
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
          <div className="flex items-center gap-5">
            <Avatar src={draft.image} name={draft.name || '?'} size={96} />
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Choose photo'}
              </Button>
              {draft.image && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft((d) => ({ ...d, image: null }))}
                >
                  Remove photo
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <TextInput
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Alex"
            autoFocus
            error={draftError}
          />
        </div>
      </Sheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete child?"
        body={
          pendingDelete
            ? `Delete ${pendingDelete.name}? Past logs keep their name and photo. Current assignments for ${pendingDelete.name} are removed; future days won't include them.`
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
        👋
      </div>
      <div>
        <p className="text-h5 text-ink">No children yet</p>
        <p className="mt-1 text-body-sm text-slate">
          Add a child to start building their routine grid.
        </p>
      </div>
      <Button size="lg" onClick={onAdd}>+ Add your first child</Button>
    </div>
  );
}

function Avatar({
  src,
  name,
  size = 56,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-yellow-light text-h4 font-medium text-yellow-dark"
    >
      {initial}
    </div>
  );
}
