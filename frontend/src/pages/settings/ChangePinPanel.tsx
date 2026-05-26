import { useState } from 'react';
import { api, setStoredPin } from '../../api';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { useToast } from '../../components/Toast';

export function ChangePinPanel() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (): string | null => {
    if (!/^[0-9]{4}$/.test(current)) return 'Current PIN must be 4 digits';
    if (!/^[0-9]{4}$/.test(next)) return 'New PIN must be 4 digits';
    if (next !== confirmNext) return 'New PIN entries do not match';
    if (next === current) return 'New PIN must differ from the current PIN';
    return null;
  };

  const handleSave = async () => {
    const e = validate();
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.changePin(current, next);
      setStoredPin(next);
      setCurrent('');
      setNext('');
      setConfirmNext('');
      toast.show('PIN updated', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-6">
      <header>
        <h2 className="text-h3 text-ink">Change PIN</h2>
        <p className="text-body-sm text-slate">
          Shared 4-digit PIN. Anyone with the PIN can open these settings.
        </p>
      </header>

      <TextInput
        label="Current PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={current}
        onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
      />
      <TextInput
        label="New PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={next}
        onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))}
      />
      <TextInput
        label="Confirm new PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={confirmNext}
        onChange={(e) => setConfirmNext(e.target.value.replace(/\D/g, ''))}
      />

      {error && (
        <div className="rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save new PIN'}
        </Button>
      </div>
    </div>
  );
}
