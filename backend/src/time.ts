import { db } from './db.js';

// Difference between "trusted" UTC and the device's UTC clock, in ms.
// trustedNowMs = Date.now() + offsetMs
let offsetMs = 0;
let lastSyncAt: Date | null = null;
let lastSyncSource: string | null = null;

// 10 minutes — enough to ride out brief network blips, small enough that the
// local crystal drifting (and the device's own clock being wrong) is corrected
// regularly.
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let syncTimer: NodeJS.Timeout | null = null;

interface SettingsRow {
  timezone: string;
}

export function getStoredTimezone(): string {
  const row = db
    .prepare('SELECT timezone FROM settings WHERE id = 1')
    .get() as SettingsRow | undefined;
  return row?.timezone ?? 'UTC';
}

export function setStoredTimezone(tz: string): void {
  if (!isValidTimezone(tz)) {
    throw new Error(`Invalid timezone: ${tz}`);
  }
  db.prepare(
    "UPDATE settings SET timezone = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(tz);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function correctedNow(): Date {
  return new Date(Date.now() + offsetMs);
}

// Returns YYYY-MM-DD in the stored timezone, using the corrected clock.
export function getLocalDate(): string {
  return formatDate(correctedNow(), getStoredTimezone());
}

// Returns HH:MM in the stored timezone, using the corrected clock.
export function getLocalHHMM(): string {
  return formatHHMM(correctedNow(), getStoredTimezone());
}

export function formatDate(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

export function formatHHMM(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl can emit '24' for midnight on some runtimes — normalise.
  const hh = h === '24' ? '00' : h;
  return `${hh}:${m}`;
}

// Returns yesterday's date (in stored tz) given today's date string.
export function yesterdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

interface TimeApiIoResponse {
  dateTime: string;
}

interface WorldTimeApiResponse {
  utc_datetime: string;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTrustedUtcMs(tz: string): Promise<{ ms: number; source: string } | null> {
  // timeapi.io returns local time for the given zone in dateTime, plus a UTC
  // offset; we ask for UTC explicitly to keep parsing simple.
  try {
    const res = await fetchWithTimeout(
      'https://timeapi.io/api/time/current/zone?timeZone=Etc/UTC',
    );
    if (res.ok) {
      const json = (await res.json()) as TimeApiIoResponse;
      const ms = Date.parse(`${json.dateTime}Z`);
      if (Number.isFinite(ms)) return { ms, source: 'timeapi.io' };
    }
  } catch {
    // try next source
  }
  try {
    const res = await fetchWithTimeout(
      'https://worldtimeapi.org/api/timezone/Etc/UTC',
    );
    if (res.ok) {
      const json = (await res.json()) as WorldTimeApiResponse;
      const ms = Date.parse(json.utc_datetime);
      if (Number.isFinite(ms)) return { ms, source: 'worldtimeapi.org' };
    }
  } catch {
    // give up — caller falls back to system clock
  }
  void tz;
  return null;
}

export async function syncTime(): Promise<void> {
  const tz = getStoredTimezone();
  const result = await fetchTrustedUtcMs(tz);
  if (!result) {
    // Leave the previous offset in place; log and move on.
    console.warn('[time] online sync failed, keeping previous offset');
    return;
  }
  const newOffset = result.ms - Date.now();
  offsetMs = newOffset;
  lastSyncAt = new Date();
  lastSyncSource = result.source;
  console.log(
    `[time] synced from ${result.source}: offset=${offsetMs}ms tz=${tz}`,
  );
}

export function startTimeSync(): void {
  if (syncTimer) return;
  void syncTime();
  syncTimer = setInterval(() => void syncTime(), SYNC_INTERVAL_MS);
}

export function stopTimeSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export interface ClockStatus {
  datetime: string; // ISO UTC
  timezone: string;
  date: string; // YYYY-MM-DD in tz
  time: string; // HH:MM in tz
  offset_ms: number;
  last_sync_at: string | null;
  last_sync_source: string | null;
}

export function getClockStatus(): ClockStatus {
  const now = correctedNow();
  const tz = getStoredTimezone();
  return {
    datetime: now.toISOString(),
    timezone: tz,
    date: formatDate(now, tz),
    time: formatHHMM(now, tz),
    offset_ms: offsetMs,
    last_sync_at: lastSyncAt ? lastSyncAt.toISOString() : null,
    last_sync_source: lastSyncSource,
  };
}
