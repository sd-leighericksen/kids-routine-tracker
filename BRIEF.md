# Project Brief — Household Routine Grid

## 1. Overview

A touch-first web app for tracking children's daily routines. Children tap a cell on a grid to mark a task done; once a child completes all their assigned tasks for a time block, a short celebration plays (confetti, a trumpet sound, and a random GIF). A PIN-protected parent area handles all configuration, and a reporting view tracks streaks and completion history. Webhooks fire into n8n on key events.

This is **not** a weekly chore chart. It is a fresh, repeating routine that resets every day. Every morning and every afternoon starts a clean slate.

The app runs locally on a single wall-mounted touch-screen tablet driven by an Ubuntu machine, deployed via Docker.

## 2. Target environment

- **Device:** 10" touch screen, **landscape only**. The UI must be locked to landscape and sized for finger taps. No mobile-portrait layout, no desktop-mouse assumptions.
- **Users:** 5 children, all aged 8+. They can read, so task names carry meaning and emoji are reinforcement, not the primary signal.
- **Host:** Ubuntu machine running Docker. Single client for now, but the API must not assume single-client (don't paint us into a corner if a second screen appears later).
- **Network:** Local LAN only. No public exposure required.

## 3. Architecture

- **Front end:** React + Tailwind CSS, landscape-locked, touch-optimised.
- **Back end:** A single Node service (Fastify or Express) exposing a REST/JSON API over the LAN.
- **Database:** SQLite (single file). No separate DB server.
- **Scheduler:** An in-process scheduler in the Node service running a **per-minute** check for deadline-approaching and deadline-missed events.
- **Deployment:** Dockerised, runs on the Ubuntu host. SQLite file lives on a mounted volume so it survives container rebuilds and can be backed up by copying one file.
- **Design source of truth:** A `design.md` file in the project root defines the visual language (colours, typography, spacing, component look). All front-end styling decisions defer to `design.md`.

### Why this stack
Postgres was considered and rejected: five kids, two blocks, one device is a tiny dataset and a single client. SQLite removes an always-on DB server (and its failure modes) while keeping every feature. The Node service exists primarily because webhooks and the missed-deadline event must fire even when nobody is looking at the screen — a pure front end can't do that reliably.

## 4. Core concepts and data model

### Entities

**Child**
- `id`
- `name`
- `image` (uploaded photo / avatar)

**Time block** (e.g. "Morning", "Afternoon")
- `id`
- `name`
- `deadline_time` (time of day, e.g. 08:00)
- optional visual identity (colour) — see open items in design.md

**Task**
- `id`
- `name`
- `emoji`

### Relationships

Tasks are assigned **per child, per time block**. When setting up a time block, the parent:
1. Selects which children are in that block.
2. Selects existing tasks or creates new ones.
3. Builds the relations — i.e. assigns specific tasks to specific children within that block.

This means tasks can be **shared** (the same task assigned to several children) or **individual** (assigned to one child only). Two children in the same block can have different task lists.

### Daily completion logs (immutable)

Each day, for each child-task-block assignment, a completion record is written. **Logs are immutable snapshots.** They capture what was assigned *that day* and whether/when it was completed. Editing a time block's configuration only affects **future** days — it never retroactively rewrites past logs or recalculates historical streaks.

Log record (conceptual):
- `id`
- `date`
- `child_id`
- `block_id`
- `task_id` (or a frozen copy of task name/emoji at the time)
- `completed` (bool)
- `completed_at` (timestamp, nullable)
- `block_outcome` at finalisation: `complete` | `missed`

## 5. Daily lifecycle

- **Block states:** each time block, on a given day, is in one of three states: **active**, **locked-complete**, or **locked-missed**.
- **Deadline finalisation:** when a block's `deadline_time` passes, that block **locks**. Incomplete tasks at lock time are recorded as **missed**. The grid for that block becomes visually locked and non-interactive.
- **Midnight rollover:** is just the day boundary that generates tomorrow's fresh grid. Each block is finalised at its **own** deadline, not at midnight.
- **Robust rollover:** "what day is it and what should today look like" is computed **on load/wake**, not by relying on a job firing exactly at 00:00. If the tablet is asleep or offline overnight, it resolves the correct day's grid when it wakes. The per-minute scheduler handles deadline events while the app is running.

## 6. Front-end behaviour

### The grid (main / kid-facing view)
- Children's **names (and photos) run down the left**, top to bottom.
- **Tasks run across the top.**
- The currently active time block is shown. (Block selection / how morning vs afternoon is chosen is an open design item — likely auto-selected by current time with a manual override.)
- Tapping the cell at a name × task intersection marks it **done** with a big cross.
- **Open grid:** anyone can tap any cell. No per-child login. A completed cell **can be un-tapped** (mis-taps are expected).
- **Locked-missed** blocks render in a defined locked state (greyed / overlay — defined in design.md), with whatever crosses were earned frozen in place.

### Celebration (per child)
- Triggers when a child completes **all** their assigned tasks in the active block.
- Plays: confetti fills the screen + a trumpet sound + a random GIF.
- Duration: a short fixed **4–5 seconds**, then clears. Overlapping celebrations are not specially handled (concurrent completions are unlikely with 5 kids); a celebration simply plays out.

### GIFs (Giphy, live)
- Pull live from the **Giphy API** with `rating=g`.
- Seed the search with a **wholesome fixed term** (e.g. `high five`).
- **Pre-fetch** a small batch on app load so there's no network lag at the celebration moment — never call the API live mid-celebration.
- Requires a Giphy API key (config / env var).

## 7. Parent / settings view

- Protected by a **single shared 4-digit PIN**.
- Capabilities:
  - **Children:** add/edit/remove — name + image.
  - **Time blocks:** add/edit/remove — name + deadline time.
  - **Tasks:** add/edit/remove — name + emoji.
  - **Assignment:** within a time block, select children and assign tasks to them (shared or individual), as described in the data model.
  - **Reporting** (see below) lives in here for v1.
- Config changes apply to **future days only**.

## 8. Reporting (v1 scope)

Lives inside the PIN-protected parent area. Reads straight off the immutable logs.

- **Per child:** current **streak** (consecutive days where every assigned task across all their blocks was completed before deadline) and **completion rate** over rolling **7-day** and **30-day** windows.
- **Household day log:** a scrollable, day-by-day view of who completed what and which blocks were missed.

Deliberately **out of scope for v1:** sibling leaderboards, points economies, kid-facing reward screens. These can be added later additively. (Leaderboards between siblings are intentionally avoided — motivating for the winner, demoralising for the rest.)

## 9. Webhooks (n8n)

Fired from the Node service into n8n. Clean event taxonomy:

| Event | When it fires |
|---|---|
| `task.completed` | A task cell is marked done |
| `child.all_complete` | A child completes all assigned tasks in a block |
| `block.deadline_approaching` | ~15 min before a block's deadline (per-minute scheduler) |
| `block.deadline_missed` | A block's deadline passes with incomplete tasks |

Each event payload should carry enough context to be useful in n8n (child, block, task where relevant, timestamp, date). Webhook target URL(s) configurable via env/config.

---

## Build stages

Build one stage at a time. Each stage should be runnable / verifiable before moving to the next.

### Stage 0 — Project scaffold
- Set up the repo: React + Tailwind front end, Node (Fastify/Express) back end, SQLite, Docker config.
- Read and honour `design.md` for all styling.
- Landscape-lock the front end and establish the base layout shell.
- Get a "hello world" front end talking to a "hello world" API endpoint, running in Docker against a SQLite file on a mounted volume.

### Stage 1 — Data model & API foundation
- Define the SQLite schema: children, time blocks, tasks, the per-child-per-block task assignments, and the immutable daily logs.
- Build CRUD API endpoints for children, blocks, and tasks (no UI yet beyond what's needed to test).
- Seed with sample data for development.

### Stage 2 — Parent settings view (config)
- PIN gate (single shared 4-digit PIN).
- Children CRUD (name + image upload).
- Time blocks CRUD (name + deadline time).
- Tasks CRUD (name + emoji).
- Assignment flow: within a block, select children and assign tasks (shared or individual).

### Stage 3 — The grid (main view)
- Render the active block as a grid: children (name + photo) down the left, tasks across the top.
- Tap to mark done (big cross); tap again to un-mark.
- Auto-select the active block by current time, with manual override.
- Persist completions to the daily log.

### Stage 4 — Daily lifecycle & locking
- Implement the three block states (active / locked-complete / locked-missed).
- Deadline finalisation: lock the block at its deadline, record incomplete tasks as missed, render the locked-missed visual state.
- On-load/wake day resolution (robust rollover) so the correct day's fresh grid appears.

### Stage 5 — Celebration
- Detect per-child all-complete.
- Confetti + trumpet sound + random pre-fetched GIF, 4–5 seconds.
- Giphy integration: seeded search term, `rating=g`, batch pre-fetch on load.

### Stage 6 — Scheduler & webhooks
- Per-minute scheduler in the Node service.
- Wire the four events into n8n (`task.completed`, `child.all_complete`, `block.deadline_approaching`, `block.deadline_missed`) with configurable target URL(s).

### Stage 7 — Reporting
- Per-child streaks and 7/30-day completion rates.
- Household day-by-day log.
- All read from immutable logs, surfaced inside the parent area.

### Stage 8 — Polish & hardening
- Edge cases: mis-tap handling, offline/wake behaviour, empty states, locked-state interactions.
- Final design pass against `design.md`.
- Backup note: document that backing up = copying the SQLite file.
