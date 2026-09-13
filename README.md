# TheAll Messenger — Student/Class/Clinic Master Data

An internal desktop tool for managing student, class, and clinic-assignment
master data over the LAN. This is the first sub-project of TheAll Messenger:
a Node.js/Express/SQLite server plus an Electron + React desktop client, kept
in sync via a WebSocket-based live-refresh channel.

## Monorepo layout

npm workspaces, three packages:

- `shared/` — Zod schemas and shared types (`Student`, `Class`,
  `ClinicAssignment`, `ApiResponse`, WebSocket change-message contract)
  used by both `server` and `desktop`.
- `server/` — Express REST API + WebSocket change broadcaster, backed by
  SQLite (`better-sqlite3`).
- `desktop/` — Electron shell around a Vite + React renderer, with CRUD
  screens for students, classes, and clinic assignments.

## Running for development

From the repo root:

```bash
npm install
```

Then, in separate terminals:

```bash
npm run dev --workspace=server    # starts the API on http://localhost:4000
npm run dev --workspace=desktop   # starts Vite + Electron
```

The desktop app's Electron window requires a real display (X11/Wayland/macOS/
Windows) — it will not launch in CI or headless sandboxes. The Vite dev
server on its own (`http://localhost:5173`) can still be exercised in a
browser without Electron.

Useful workspace-scoped scripts (also runnable at the root with
`--workspaces --if-present`):

- `npm run test --workspace=<shared|server|desktop>`
- `npm run typecheck --workspace=<shared|server|desktop>`

## Design background

The original product concept, full design history, and the implementation
plan for this slice live under `docs/superpowers/`:

- [Student database design spec](docs/superpowers/specs/2026-09-13-student-database-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-13-student-class-clinic-master-data.md)

Authentication and a packaged production build are deferred to later work;
this slice targets LAN-only internal use during development.
