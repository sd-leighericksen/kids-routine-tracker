import { useCallback, useEffect, useState } from 'react';
import { api, type WebhookSettings } from '../../api';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function WebhooksPanel() {
  const toast = useToast();
  const [data, setData] = useState<WebhookSettings | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getWebhooks()
      .then((d) => {
        setData(d);
        setDraft(d.urls.join('\n'));
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const urls = draft
      .split(/\n+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    setSaving(true);
    setError(null);
    try {
      const res = await api.setWebhooks(urls);
      setDraft(res.urls.join('\n'));
      toast.show(
        res.urls.length === 0
          ? 'Webhook URLs cleared'
          : `Saved ${res.urls.length} webhook URL${res.urls.length === 1 ? '' : 's'}`,
        'success',
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await api.testWebhooks();
      if (res.delivered_to === 0) {
        toast.show('No webhook URLs configured', 'error');
      } else {
        toast.show(
          `Test event sent to ${res.delivered_to} URL${res.delivered_to === 1 ? '' : 's'}`,
          'success',
        );
      }
      // Give the async POST a moment to land in webhook_events, then reload
      // the recent-events table so the result shows up.
      setTimeout(load, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header>
        <h2 className="text-h3 text-ink">Webhooks</h2>
        <p className="text-body-sm text-slate">
          POST a JSON event to one or more URLs whenever a task is completed, a
          kid finishes all of their tasks in a block, a block's deadline is
          approaching, or a block is missed. Each event type is described in
          the README.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-body-sm text-ink" htmlFor="webhook-urls">
          URLs (one per line)
        </label>
        <textarea
          id="webhook-urls"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://example.com/hooks/routine"
          rows={5}
          spellCheck={false}
          className="min-h-32 rounded-2xl border border-hairline-strong bg-canvas px-4 py-3 text-body-md text-ink font-mono"
        />

        {data && data.env_urls.length > 0 && (
          <div className="rounded-2xl border border-hairline bg-surface-soft px-4 py-3 text-body-sm text-slate">
            <div className="text-caption-bold uppercase tracking-wider text-stone">
              Also delivering to (from WEBHOOK_URL env var)
            </div>
            <ul className="mt-2 list-inside list-disc font-mono text-body-sm text-ink">
              {data.env_urls.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-brand-red-dark/30 bg-brand-red/30 px-4 py-2 text-body-sm text-brand-red-dark">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save URLs'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Sending…' : 'Send test event'}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-h5 text-ink">Recent deliveries</h3>
        {data && data.recent.length === 0 ? (
          <p className="text-body-sm text-slate">No webhook events yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-hairline">
            <table className="w-full border-collapse text-body-sm">
              <thead className="bg-surface-soft text-caption-bold uppercase tracking-wider text-stone">
                <tr>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data?.recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-hairline-soft text-ink"
                  >
                    <td className="px-4 py-3 font-mono">{r.event}</td>
                    <td className="px-4 py-3 text-slate">
                      {formatTimestamp(r.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {r.delivered ? (
                        <span className="rounded-full bg-teal-light px-2 py-0.5 text-caption-bold text-moss-dark">
                          delivered
                        </span>
                      ) : r.last_error ? (
                        <span className="rounded-full bg-brand-red px-2 py-0.5 text-caption-bold text-brand-red-dark">
                          failed
                        </span>
                      ) : r.attempts === 0 ? (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-caption-bold text-stone">
                          no targets
                        </span>
                      ) : (
                        <span className="rounded-full bg-yellow-light px-2 py-0.5 text-caption-bold text-yellow-dark">
                          pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {r.last_error ?? (r.delivered_at ? `delivered ${formatTimestamp(r.delivered_at)}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
