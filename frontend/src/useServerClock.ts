import { useEffect, useState } from 'react';
import { api, type ClockStatus } from './api';

// Resync the offset with the server every 30s; tick locally every second using
// the cached offset, so the visible clock stays smooth even between syncs.
const RESYNC_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 1000;

interface ServerClock {
  date: string; // YYYY-MM-DD in server tz
  time: string; // HH:MM in server tz
  timezone: string;
  isoDate: Date;
}

interface InternalState {
  offsetMs: number;
  timezone: string;
}

function formatTime(date: Date, tz: string): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(date: Date, tz: string): string {
  // en-CA gives YYYY-MM-DD
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

export function useServerClock(): ServerClock | null {
  const [state, setState] = useState<InternalState | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      api
        .getClock()
        .then((c: ClockStatus) => {
          if (cancelled) return;
          setState({ offsetMs: c.offset_ms, timezone: c.timezone });
        })
        .catch(() => {
          /* offline — keep last known state, or fall through with null */
        });
    void sync();
    const id = setInterval(sync, RESYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = setInterval(
      () => setNow(new Date(Date.now() + state.offsetMs)),
      TICK_INTERVAL_MS,
    );
    setNow(new Date(Date.now() + state.offsetMs));
    return () => clearInterval(id);
  }, [state]);

  if (!state) return null;
  return {
    date: formatDate(now, state.timezone),
    time: formatTime(now, state.timezone),
    timezone: state.timezone,
    isoDate: now,
  };
}
