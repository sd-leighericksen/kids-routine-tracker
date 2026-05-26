import { db } from './db.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '00:00',
    deadline_time TEXT NOT NULL,
    color TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (block_id, child_id, task_id)
  );

  -- Immutable daily log. Frozen snapshot columns so deleting or renaming
  -- a child/block/task never rewrites history.
  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
    block_name TEXT NOT NULL,
    block_start_time TEXT,
    block_deadline_time TEXT NOT NULL,
    child_id INTEGER REFERENCES children(id) ON DELETE SET NULL,
    child_name TEXT NOT NULL,
    child_image TEXT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    task_name TEXT NOT NULL,
    task_emoji TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    block_outcome TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (date, block_id, child_id, task_id)
  );

  CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs (date);
  CREATE INDEX IF NOT EXISTS idx_daily_logs_child_date ON daily_logs (child_id, date);
  CREATE INDEX IF NOT EXISTS idx_assignments_block ON assignments (block_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_child ON assignments (child_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_task ON assignments (task_id);

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin TEXT NOT NULL DEFAULT '1234',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO settings (id, pin) VALUES (1, '1234');

  -- One row per local date that's been snapshotted into daily_logs.
  -- Presence gates the snapshot so today's grid is frozen at first load —
  -- assignment edits made later in the day only affect future days.
  CREATE TABLE IF NOT EXISTS daily_snapshots (
    date TEXT PRIMARY KEY,
    snapshotted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Audit log + dedup source for outbound webhook events.
  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    date TEXT,
    block_id INTEGER,
    child_id INTEGER,
    task_id INTEGER,
    log_id INTEGER,
    payload TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_events_event_date_block
    ON webhook_events (event, date, block_id);
`;

function columnExists(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

export function runMigrations(): void {
  db.exec(SCHEMA);

  // Additive column migrations for existing DBs (CREATE TABLE IF NOT EXISTS
  // above is a no-op when the table already exists).
  if (!columnExists('blocks', 'start_time')) {
    db.exec("ALTER TABLE blocks ADD COLUMN start_time TEXT NOT NULL DEFAULT '00:00'");
  }
  if (!columnExists('daily_logs', 'block_start_time')) {
    db.exec('ALTER TABLE daily_logs ADD COLUMN block_start_time TEXT');
  }
}
