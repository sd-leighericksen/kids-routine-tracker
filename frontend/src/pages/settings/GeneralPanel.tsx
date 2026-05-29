import { useEffect, useMemo, useState } from 'react';
import { api, type ClockStatus } from '../../api';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';

function listTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intl.supportedValuesOf === 'function') {
    try {
      return intl.supportedValuesOf('timeZone');
    } catch {
      // fall through to curated list
    }
  }
  return [
    'UTC',
    'Pacific/Auckland',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Hong_Kong',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Sao_Paulo',
  ];
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString();
}

export function GeneralPanel() {
  const toast = useToast();
  const [clock, setClock] = useState<ClockStatus | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezones = useMemo(listTimezones, []);

  useEffect(() => {
    api
      .getClock()
      .then((c) => {
        setClock(c);
        setSelected(c.timezone);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Live-update the displayed clock once per second using the offset, with a
  // resync from the server every 30s so drift stays bounded.
  useEffect(() => {
    if (!clock) return;
    const tick = setInterval(() => {
      setClock((prev) => {
        if (!prev) return prev;
        const now = new Date(Date.now() + prev.offset_ms);
        return {
          ...prev,
          datetime: now.toISOString(),
          time: now.toLocaleTimeString('en-GB', {
            timeZone: prev.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          date: now.toLocaleDateString('en-CA', {
            timeZone: prev.timezone,
          }),
        };
      });
    }, 1000);
    const resync = setInterval(() => {
      api
        .getClock()
        .then((c) => setClock(c))
        .catch(() => {
          /* offline — keep ticking with last known offset */
        });
    }, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [clock !== null]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.setTimezone(selected);
      const c = await api.getClock();
      setClock(c);
      setSelected(c.timezone);
      toast.show(`Timezone set to ${res.timezone}`, 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <h2 className="text-h3 text-ink">General</h2>
        <p className="text-body-sm text-slate">
          The tablet's own clock can drift. Setting a timezone and syncing from
          an online source keeps routine timing correct across every device.
        </p>
      </header>

      <section className="rounded-2xl border border-hairline bg-surface-soft p-6">
        <div className="flex flex-col gap-1">
          <span className="text-caption-bold uppercase tracking-wider text-stone">
            Current time
          </span>
          <span className="text-stat-display tabular-nums text-ink">
            {clock?.time ?? '—'}
          </span>
          <span className="text-body-sm text-slate">
            {clock?.date ?? '—'} · {clock?.timezone ?? '—'}
          </span>
          <span className="mt-2 text-caption text-stone">
            Last online sync: {formatLastSync(clock?.last_sync_at ?? null)}
            {clock?.last_sync_source ? ` (${clock.last_sync_source})` : ''}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-body-sm text-ink" htmlFor="tz-select">
          Timezone
        </label>
        <select
          id="tz-select"
          className="h-12 rounded-full border border-hairline-strong bg-canvas px-4 text-button-md text-ink"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {timezones.includes(selected) ? null : (
            <option value={selected}>{selected}</option>
          )}
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>

        {error && (
          <div className="rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
            {error}
          </div>
        )}

        <div>
          <Button
            onClick={handleSave}
            disabled={saving || !selected || selected === clock?.timezone}
          >
            {saving ? 'Saving…' : 'Save timezone'}
          </Button>
        </div>
      </section>
    </div>
  );
}
