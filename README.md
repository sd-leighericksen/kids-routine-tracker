# Routine Grid

A touch-first web app for tracking children's daily routines on a wall-mounted Ubuntu tablet. PIN-protected parent settings, immutable per-day logs, deadline-locking with `complete` / `missed` outcomes, per-child celebrations on completion, and webhook events into n8n for automation.

Not a weekly chore chart — a fresh, repeating routine that resets every day.

## Stack

- **Frontend** — React + Vite + Tailwind + react-router-dom (port `5173`)
- **Backend** — Fastify + better-sqlite3 (port `3001`)
- **Database** — single SQLite file at `backend/data/app.db`, no separate server
- **Workspaces** — npm workspaces (`frontend`, `backend`)

## Quickstart

```bash
npm install
npm run seed -w backend                # 5 kids, 2 blocks, 8 tasks, assignment matrix
cp backend/.env.example backend/.env   # fill in keys you want
npm run dev                            # both servers
```

Open **http://127.0.0.1:5173/** in landscape. Portrait shows a "please rotate" overlay — the UI is locked to landscape for the wall-mounted 10" tablet form factor.

Parent PIN defaults to `1234`. Change it from `/settings/pin` on first boot.

## Configuration (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `GIPHY_API_KEY` | _(unset)_ | Celebration GIFs. Without it, celebrations play confetti + sound only — no GIF, no errors. |
| `GIPHY_QUERY` | `high five` | Seeded wholesome search term, `rating=g`. |
| `WEBHOOK_URL` | _(unset)_ | Comma-separated webhook targets (e.g. n8n). Events are recorded in `webhook_events` even when unset. |
| `WEBHOOK_APPROACH_MINUTES` | `15` | Window before a block's deadline for `block.deadline_approaching`. |
| `PORT` | `3001` | Backend port. |
| `HOST` | `127.0.0.1` | Backend bind address. |

A real MP3 placed at `frontend/public/trumpet.mp3` overrides the Web Audio synth fanfare used for celebrations.

## How it's organised

```
backend/
  src/
    server.ts         # Fastify bootstrap, dotenv, scheduler, signal handlers
    db.ts             # better-sqlite3 handle, WAL mode, FK on
    migrations.ts     # idempotent CREATE TABLE IF NOT EXISTS
    lifecycle.ts      # ensureSnapshot, finalizeDueBlocks (fires deadline_missed)
    scheduler.ts      # 60s tick: snapshot, approaching, finalise
    webhooks.ts       # typed payloads, record + fire-and-forget POST
    auth.ts           # X-Parent-Pin preHandler
    seed.ts           # `npm run seed -w backend`, idempotent
    routes/
      children, blocks, tasks, assignments  # CRUD (writes need X-Parent-Pin)
      auth, settings                        # PIN verify + change
      uploads                               # multipart → /uploads/<sha>.<ext>
      today, logs                           # grid + completion toggle
      giphy                                 # celebration GIF batch
      reports                               # streaks + 7/30-day + day log
  data/               # gitignored: app.db (+wal,+shm) and uploads/

frontend/
  src/
    api.ts            # typed client, attaches X-Parent-Pin on writes
    App.tsx           # routes
    components/       # Button, TextInput, Sheet, ConfirmDialog, Toast,
                      # PinPad, PinGate, Celebration, AppShell, PortraitGate
    pages/
      Grid.tsx        # kid-facing routine grid
      SettingsLayout.tsx
      settings/       # Children, Blocks, Tasks, Assignments, Reports, ChangePin
```

## Routes

| Path | Who | Auth | Notes |
|---|---|---|---|
| `/` | Kids + parents | open | Routine grid. Locked blocks render greyed; cells are non-interactive when locked. |
| `/settings/*` | Parents | PIN | Children, Time blocks, Tasks, Assignments, Reports, Change PIN. |

GET endpoints under `/api/*` are open (so kid-facing screens work without a PIN). Mutating endpoints (POST / PATCH / DELETE on entities, plus uploads and PIN change) require `X-Parent-Pin: <pin>`.

## Lifecycle & lock model

- The day's grid is **snapshotted at first load** of `GET /api/today` — every then-current assignment becomes a `daily_logs` row. The snapshot is gated by `daily_snapshots(date)` so editing assignments later in the day **only affects future days**.
- A 60-second scheduler tick (`backend/src/scheduler.ts`):
  1. ensures today's snapshot,
  2. fires `block.deadline_approaching` for blocks within `WEBHOOK_APPROACH_MINUTES` (deduped per (date, block) via `webhook_events`),
  3. finalises today's + yesterday's due blocks (catches up after overnight tablet sleep).
- Finalising a block sets `block_outcome = 'complete'` if every log is `completed = 1`, else `'missed'`. The missed branch fires `block.deadline_missed`.
- The PATCH endpoint refuses to set `completed = 1` once `block_outcome IS NOT NULL`. That's how reporting's "completed before deadline" rule is enforced — no timestamp math needed.
- `block_deadline_time` on `daily_logs` is **frozen at snapshot time**. Editing a block's deadline in settings tomorrow morning cannot retroactively lock or unlock today.

## Webhooks (n8n)

Four event types are recorded in `webhook_events` and POSTed (fire-and-forget, 10s timeout, no retries) to every URL in `WEBHOOK_URL`:

| Event | When |
|---|---|
| `task.completed` | log transitions false → true (no fire on un-mark) |
| `child.all_complete` | the PATCH that completed the kid's last task in the block |
| `block.deadline_approaching` | scheduler tick within the configured window |
| `block.deadline_missed` | finaliser marks the block as `missed` |

Payload shapes are typed in `backend/src/webhooks.ts`. Records persist even when no target is configured — handy as an audit log.

## Reports

Lives at `/settings/reports`:

- **Per child** — current streak (consecutive perfect days, walking back from today; today's in-progress state is skipped, not penalised), 7-day and 30-day cumulative completion rate.
- **Household day log** — newest-first list of date cards. Each shows per-block outcome chip and per-kid `done/total`.

Reports read straight from immutable `daily_logs` — renaming or deleting an entity in settings never rewrites history.

## Backup & restore

The entire app state — children, blocks, tasks, assignments, every immutable daily log, the parent PIN — lives in:

```
backend/data/app.db
```

**To back up:** stop the backend (so the WAL is flushed) and copy:

```
backend/data/app.db
backend/data/app.db-wal   # if present (WAL mode)
backend/data/app.db-shm   # if present
backend/data/uploads/     # child photos
```

**To restore:** stop the backend, drop those files back in place, restart.

That's the whole story. No external service, no migration scripts to run on restore — `migrations.ts` uses `CREATE TABLE IF NOT EXISTS` so it's safe to start the backend against any version of the file the app has touched.

## Deployment

Currently runs natively (`npm run dev` against `backend/data/app.db`). The original brief called for Docker; containerising is a follow-up — a single Node service plus a bind-mounted `backend/data/` volume covers the whole app.

## Build stages

Implemented per the brief's plan:

- **0** — Project scaffold (React + Tailwind + Fastify + SQLite, landscape shell)
- **1** — Schema + CRUD API + idempotent seed
- **2** — PIN-gated parent settings (children + photo upload, blocks, tasks, assignment matrix)
- **3** — Kid-facing grid with daily-log persistence and optimistic toggles
- **4** — Block state machine (active / locked-complete / locked-missed) and on-load day resolution
- **5** — Per-child celebration (confetti + Web Audio fanfare + pre-fetched Giphy)
- **6** — Per-minute scheduler + four n8n webhook events with audit log
- **7** — Reports (streaks + 7/30-day rates + household day log)
- **8** — Polish: touch-friendly dialogs, toast feedback, PIN shake, README & backup docs
