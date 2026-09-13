# 학생·수업·클리닉 마스터 데이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend API + Electron desktop screens that let a teacher/TA jointly maintain the student roster, group classes (with weekly schedule + enrollment), and clinic assignments — the foundational data every later sub-project (attendance, handover notes, calendar/export) reads from.

**Architecture:** An npm-workspaces monorepo with three packages: `shared` (Zod schemas + inferred TypeScript types used by both sides, so request/response shapes never drift), `server` (Express + better-sqlite3 REST API, with a `ws` broadcast so connected clients know to refetch when data changes), and `desktop` (Electron + Vite + React renderer that talks to the server over plain `fetch`/`WebSocket` — no preload/IPC needed since this app only calls a network API, not Node APIs). The server runs locally for this plan; deploying it into the academy's NAS Container Manager is a separate follow-up task once more sub-projects exist.

**Tech Stack:** TypeScript everywhere, Express, better-sqlite3, ws, Zod, Vitest + Supertest (server tests), React 18, Vite, @testing-library/react (desktop tests), Electron.

**Spec:** `docs/superpowers/specs/2026-09-13-student-database-design.md`

## Global Constraints

- TypeScript on every file; no `any` — use `unknown` and narrow, or generics (spec references project-wide TS rules).
- All request bodies validated with Zod before touching the database; validation schemas live in `shared` so server and desktop import the same source of truth.
- Every API response uses the `ApiResponse<T>` envelope (`{ success, data?, error? }`).
- Data access goes through a Repository class per entity (`StudentRepository`, `ClassRepository`, `ClinicRepository`) — routes never touch SQL directly.
- Electron `BrowserWindow` uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` (spec's Electron security baseline).
- No raw `console.log`/`console.error` in application code — route through the small `logger` module added in Task 3 / Task 12.
- 클리닉 배정에는 담당 선생님 필드가 없다 (스펙: 조교가 감시).
- 퇴원시각 같은 이번 서브프로젝트 범위 밖의 필드(출결/알림 등)는 다루지 않는다 — 그건 서브프로젝트 2의 계획에서 다룬다.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/vitest.config.ts`
- Create: `shared/src/index.ts`
- Test: `shared/test/placeholder.test.ts`

**Interfaces:**
- Produces: the `@theall/shared` workspace package that Tasks 2+ add real exports to.

- [ ] **Step 1: Create root workspace config**

`package.json`:
```json
{
  "name": "theall-messenger-app",
  "private": true,
  "workspaces": ["shared", "server", "desktop"],
  "scripts": {
    "test": "npm run test --workspaces --if-present"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
*.sqlite3
*.sqlite3-wal
*.sqlite3-shm
```

- [ ] **Step 2: Scaffold the `shared` package**

`shared/package.json`:
```json
{
  "name": "@theall/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "vitest": "^2.1.1",
    "typescript": "^5.6.2"
  }
}
```

`shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

`shared/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node' } });
```

`shared/src/index.ts`:
```typescript
export const SHARED_PACKAGE_NAME = '@theall/shared';
```

- [ ] **Step 3: Write a placeholder test to prove the workspace wiring works**

`shared/test/placeholder.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from '../src/index.js';

describe('shared package wiring', () => {
  it('exports a name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@theall/shared');
  });
});
```

- [ ] **Step 4: Install and run the test**

Run: `npm install` (repo root), then `npm run test --workspace=shared`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore shared
git commit -m "chore: scaffold npm workspaces monorepo with shared package"
```

---

## Task 2: Shared Zod schemas for Student, Class, ClinicAssignment

**Files:**
- Create: `shared/src/schemas.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/schemas.test.ts`

**Interfaces:**
- Produces: `studentInputSchema`, `studentSchema`, `Student`, `StudentInput`, `scheduleSlotInputSchema`, `scheduleSlotSchema`, `ScheduleSlot`, `ScheduleSlotInput`, `classInputSchema`, `classSchema`, `Class`, `ClassInput`, `clinicAssignmentInputSchema`, `clinicAssignmentSchema`, `ClinicAssignment`, `ClinicAssignmentInput`, `ApiResponse<T>` — every later task imports these from `@theall/shared`.

- [ ] **Step 1: Write the failing schema tests**

`shared/test/schemas.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { studentInputSchema, classInputSchema, clinicAssignmentInputSchema } from '../src/schemas.js';

describe('studentInputSchema', () => {
  it('accepts a minimal valid student', () => {
    const result = studentInputSchema.safeParse({ name: '김민준' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = studentInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('classInputSchema', () => {
  it('requires at least one schedule slot', () => {
    const result = classInputSchema.safeParse({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: []
    });
    expect(result.success).toBe(false);
  });

  it('accepts a class with one schedule slot', () => {
    const result = classInputSchema.safeParse({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
    expect(result.success).toBe(true);
  });
});

describe('clinicAssignmentInputSchema', () => {
  it('rejects a bad time format', () => {
    const result = clinicAssignmentInputSchema.safeParse({
      studentId: 's1',
      dayOfWeek: 1,
      startTime: '6pm',
      endTime: '19:00'
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=shared`
Expected: FAIL with "Cannot find module '../src/schemas.js'"

- [ ] **Step 3: Implement the schemas**

`shared/src/schemas.ts`:
```typescript
import { z } from 'zod';

export const genderSchema = z.enum(['male', 'female']);

export const studentInputSchema = z.object({
  name: z.string().min(1, 'name is required'),
  grade: z.string().optional(),
  schoolName: z.string().optional(),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  parentPhone: z.string().optional(),
  siblingIds: z.array(z.string()).optional()
});
export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentSchema = studentInputSchema.extend({
  id: z.string(),
  siblingIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Student = z.infer<typeof studentSchema>;

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM');

export const scheduleSlotInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema
});
export type ScheduleSlotInput = z.infer<typeof scheduleSlotInputSchema>;

export const scheduleSlotSchema = scheduleSlotInputSchema.extend({
  id: z.string()
});
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

export const classInputSchema = z.object({
  name: z.string().min(1, 'name is required'),
  teacherName: z.string().min(1, 'teacherName is required'),
  schedule: z.array(scheduleSlotInputSchema).min(1, 'at least one schedule slot is required'),
  studentIds: z.array(z.string()).optional()
});
export type ClassInput = z.infer<typeof classInputSchema>;

export const classSchema = z.object({
  id: z.string(),
  name: z.string(),
  teacherName: z.string(),
  schedule: z.array(scheduleSlotSchema),
  studentIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Class = z.infer<typeof classSchema>;

export const clinicAssignmentInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema
});
export type ClinicAssignmentInput = z.infer<typeof clinicAssignmentInputSchema>;

export const clinicAssignmentSchema = clinicAssignmentInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ClinicAssignment = z.infer<typeof clinicAssignmentSchema>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

`shared/src/index.ts`:
```typescript
export * from './schemas.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=shared`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: add shared Zod schemas for student, class, clinic assignment"
```

---

## Task 3: Backend scaffold with health check + logger

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/logger.ts`
- Create: `server/src/app.ts`
- Test: `server/test/app.test.ts`

**Interfaces:**
- Consumes: nothing yet from other tasks.
- Produces: `createApp(): Express` (Task 4+ will change its signature to accept a db + broadcaster — this task's version takes no arguments and only serves `/health`), `logger.info`, `logger.error`.

- [ ] **Step 1: Scaffold `server` package**

`server/package.json`:
```json
{
  "name": "@theall/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@theall/shared": "*",
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.4",
    "@types/supertest": "^6.0.2",
    "@types/ws": "^8.5.12",
    "supertest": "^7.0.0",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

`server/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 2: Add the logger**

`server/src/logger.ts`:
```typescript
export const logger = {
  info: (...args: unknown[]): void => console.log('[info]', ...args),
  error: (...args: unknown[]): void => console.error('[error]', ...args)
};
```

- [ ] **Step 3: Write the failing health-check test**

`server/test/app.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/app.js'"

- [ ] **Step 5: Implement the minimal app**

`server/src/app.ts`:
```typescript
import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm install` (repo root, to link the new workspace), then `npm run test --workspace=server`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "chore: scaffold server package with health check"
```

---

## Task 4: SQLite schema/migration module

**Files:**
- Create: `server/src/db.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Produces: `createDb(filePath: string): Database.Database` — every repository task opens its connection through this.

- [ ] **Step 1: Write the failing test**

`server/test/db.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db.js';

describe('createDb', () => {
  it('creates all expected tables', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);

    expect(tables).toEqual([
      'class_enrollments',
      'class_schedule_slots',
      'classes',
      'clinic_assignments',
      'student_siblings',
      'students'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/db.js'"

- [ ] **Step 3: Implement the schema**

`server/src/db.ts`:
```typescript
import Database from 'better-sqlite3';

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT,
      school_name TEXT,
      gender TEXT,
      phone TEXT,
      parent_phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_siblings (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      sibling_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (student_id, sibling_id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_schedule_slots (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_enrollments (
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS clinic_assignments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db.test.ts
git commit -m "feat: add SQLite schema for students, classes, clinic assignments"
```

---

## Task 5: Student repository

**Files:**
- Create: `server/src/repositories/studentRepository.ts`
- Test: `server/test/studentRepository.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 4), `Student`/`StudentInput` (Task 2).
- Produces: `class StudentRepository` with `create(input): Student`, `update(id, input): Student | undefined`, `delete(id): boolean`, `getById(id): Student | undefined`, `list(): Student[]`.

- [ ] **Step 1: Write the failing tests**

`server/test/studentRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';

describe('StudentRepository', () => {
  let db: Database.Database;
  let repo: StudentRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new StudentRepository(db);
  });

  it('creates and retrieves a student', () => {
    const created = repo.create({ name: '김민준', grade: '중2' });
    const found = repo.getById(created.id);
    expect(found?.name).toBe('김민준');
    expect(found?.grade).toBe('중2');
    expect(found?.siblingIds).toEqual([]);
  });

  it('links siblings bidirectionally', () => {
    const a = repo.create({ name: '김민준' });
    const b = repo.create({ name: '김서연', siblingIds: [a.id] });
    const updatedA = repo.getById(a.id);
    expect(updatedA?.siblingIds).toEqual([b.id]);
  });

  it('updates a student', () => {
    const created = repo.create({ name: '김민준' });
    const updated = repo.update(created.id, { name: '김민준(수정)' });
    expect(updated?.name).toBe('김민준(수정)');
  });

  it('deletes a student', () => {
    const created = repo.create({ name: '김민준' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists students alphabetically by name', () => {
    repo.create({ name: '이지은' });
    repo.create({ name: '김민준' });
    const names = repo.list().map((s) => s.name);
    expect(names).toEqual(['김민준', '이지은']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/repositories/studentRepository.js'"

- [ ] **Step 3: Implement the repository**

`server/src/repositories/studentRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Student, StudentInput } from '@theall/shared';

interface StudentRow {
  id: string;
  name: string;
  grade: string | null;
  school_name: string | null;
  gender: string | null;
  phone: string | null;
  parent_phone: string | null;
  created_at: string;
  updated_at: string;
}

function rowToStudent(db: Database.Database, row: StudentRow): Student {
  const siblingRows = db
    .prepare('SELECT sibling_id FROM student_siblings WHERE student_id = ?')
    .all(row.id) as { sibling_id: string }[];
  return {
    id: row.id,
    name: row.name,
    grade: row.grade ?? undefined,
    schoolName: row.school_name ?? undefined,
    gender: (row.gender as Student['gender']) ?? undefined,
    phone: row.phone ?? undefined,
    parentPhone: row.parent_phone ?? undefined,
    siblingIds: siblingRows.map((r) => r.sibling_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class StudentRepository {
  constructor(private db: Database.Database) {}

  create(input: StudentInput): Student {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO students (id, name, grade, school_name, gender, phone, parent_phone, created_at, updated_at)
         VALUES (@id, @name, @grade, @schoolName, @gender, @phone, @parentPhone, @createdAt, @updatedAt)`
      )
      .run({
        id,
        name: input.name,
        grade: input.grade ?? null,
        schoolName: input.schoolName ?? null,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        parentPhone: input.parentPhone ?? null,
        createdAt: now,
        updatedAt: now
      });
    this.setSiblings(id, input.siblingIds ?? []);
    return this.getById(id)!;
  }

  update(id: string, input: StudentInput): Student | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE students SET name = @name, grade = @grade, school_name = @schoolName,
         gender = @gender, phone = @phone, parent_phone = @parentPhone, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id,
        name: input.name,
        grade: input.grade ?? null,
        schoolName: input.schoolName ?? null,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        parentPhone: input.parentPhone ?? null,
        updatedAt: now
      });
    this.setSiblings(id, input.siblingIds ?? []);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM students WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getById(id: string): Student | undefined {
    const row = this.db.prepare('SELECT * FROM students WHERE id = ?').get(id) as
      | StudentRow
      | undefined;
    return row ? rowToStudent(this.db, row) : undefined;
  }

  list(): Student[] {
    const rows = this.db.prepare('SELECT * FROM students ORDER BY name').all() as StudentRow[];
    return rows.map((row) => rowToStudent(this.db, row));
  }

  private setSiblings(studentId: string, siblingIds: string[]): void {
    this.db
      .prepare('DELETE FROM student_siblings WHERE student_id = ? OR sibling_id = ?')
      .run(studentId, studentId);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO student_siblings (student_id, sibling_id) VALUES (?, ?)'
    );
    for (const siblingId of siblingIds) {
      insert.run(studentId, siblingId);
      insert.run(siblingId, studentId);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/studentRepository.ts server/test/studentRepository.test.ts
git commit -m "feat: add StudentRepository with bidirectional sibling links"
```

---

## Task 6: Broadcast helper

**Files:**
- Create: `server/src/broadcast.ts`
- Test: `server/test/broadcast.test.ts`

**Interfaces:**
- Produces: `createBroadcaster(wss): Broadcaster`, `type Broadcaster = (topic: 'students' | 'classes' | 'clinics') => void`, `type ChangeTopic`. Task 7+ routes take a `Broadcaster` and call it after every mutation.

- [ ] **Step 1: Write the failing test**

`server/test/broadcast.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { createBroadcaster } from '../src/broadcast.js';

describe('createBroadcaster', () => {
  it('sends a changed message to every open client', () => {
    const openClient = { readyState: 1, OPEN: 1, send: vi.fn() };
    const closedClient = { readyState: 3, OPEN: 1, send: vi.fn() };
    const wss = { clients: new Set([openClient, closedClient]) };

    const broadcast = createBroadcaster(wss as never);
    broadcast('students');

    expect(openClient.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'changed', topic: 'students' })
    );
    expect(closedClient.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/broadcast.js'"

- [ ] **Step 3: Implement the broadcaster**

`server/src/broadcast.ts`:
```typescript
import type { WebSocketServer } from 'ws';

export type ChangeTopic = 'students' | 'classes' | 'clinics';

export function createBroadcaster(wss: WebSocketServer) {
  return function broadcastChange(topic: ChangeTopic): void {
    const message = JSON.stringify({ type: 'changed', topic });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  };
}

export type Broadcaster = ReturnType<typeof createBroadcaster>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/src/broadcast.ts server/test/broadcast.test.ts
git commit -m "feat: add WebSocket change broadcaster"
```

---

## Task 7: Student REST routes + wire into `createApp`

**Files:**
- Create: `server/src/routes/students.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/studentsRoute.test.ts`
- Modify: `server/test/app.test.ts`

**Interfaces:**
- Consumes: `StudentRepository` (Task 5), `Broadcaster` (Task 6), `studentInputSchema`/`ApiResponse`/`Student` (Task 2).
- Produces: `createStudentsRouter(repo, broadcast): Router`. `createApp` now takes `(db: Database.Database, broadcast: Broadcaster): Express`.

- [ ] **Step 1: Update `app.test.ts` for the new `createApp` signature**

`server/test/app.test.ts` (replace the whole file):
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const db = createDb(':memory:');
    const broadcast: Broadcaster = vi.fn();
    const app = createApp(db, broadcast);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
```

- [ ] **Step 2: Write the failing students route tests**

`server/test/studentsRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast), broadcast };
}

describe('/students', () => {
  it('creates and lists a student, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app).post('/students').send({ name: '김민준' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.name).toBe('김민준');
    expect(broadcast).toHaveBeenCalledWith('students');

    const listRes = await request(app).get('/students');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a student with no name', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/students').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when updating a missing student', async () => {
    const { app } = buildApp();
    const res = await request(app).patch('/students/does-not-exist').send({ name: '이지은' });
    expect(res.status).toBe(404);
  });

  it('deletes a student', async () => {
    const { app } = buildApp();
    const createRes = await request(app).post('/students').send({ name: '김민준' });
    const deleteRes = await request(app).delete(`/students/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
    const listRes = await request(app).get('/students');
    expect(listRes.body.data).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `createApp` still takes zero arguments and `/students` does not exist.

- [ ] **Step 4: Implement the students router**

`server/src/routes/students.ts`:
```typescript
import { Router } from 'express';
import { studentInputSchema, type ApiResponse, type Student } from '@theall/shared';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createStudentsRouter(repo: StudentRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<Student[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = studentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const student = repo.create(parsed.data);
    broadcast('students');
    const response: ApiResponse<Student> = { success: true, data: student };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = studentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const student = repo.update(req.params.id, parsed.data);
    if (!student) {
      const response: ApiResponse<never> = { success: false, error: 'student not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('students');
    const response: ApiResponse<Student> = { success: true, data: student };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'student not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('students');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

- [ ] **Step 5: Wire it into `createApp`**

`server/src/app.ts` (replace the whole file):
```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { StudentRepository } from './repositories/studentRepository.js';
import { createStudentsRouter } from './routes/students.js';
import type { Broadcaster } from './broadcast.js';

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));

  return app;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/students.ts server/src/app.ts server/test/studentsRoute.test.ts server/test/app.test.ts
git commit -m "feat: add students REST routes with change broadcast"
```

---

## Task 8: Class repository

**Files:**
- Create: `server/src/repositories/classRepository.ts`
- Test: `server/test/classRepository.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 4), `Class`/`ClassInput`/`ScheduleSlot` (Task 2).
- Produces: `class ClassRepository` with `create`, `update`, `delete`, `getById`, `list` — same shape as `StudentRepository`.

- [ ] **Step 1: Write the failing tests**

`server/test/classRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';

describe('ClassRepository', () => {
  let db: Database.Database;
  let students: StudentRepository;
  let repo: ClassRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    students = new StudentRepository(db);
    repo = new ClassRepository(db);
  });

  it('creates a class with schedule and enrollment', () => {
    const student = students.create({ name: '김민준' });
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    expect(created.schedule).toHaveLength(1);
    expect(created.studentIds).toEqual([student.id]);
  });

  it('replaces schedule and enrollment on update', () => {
    const student = students.create({ name: '김민준' });
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const updated = repo.update(created.id, {
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 4, startTime: '18:00', endTime: '19:30' }],
      studentIds: []
    });

    expect(updated?.schedule).toEqual([
      expect.objectContaining({ dayOfWeek: 4, startTime: '18:00', endTime: '19:30' })
    ]);
    expect(updated?.studentIds).toEqual([]);
  });

  it('deletes a class', () => {
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/repositories/classRepository.js'"

- [ ] **Step 3: Implement the repository**

`server/src/repositories/classRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Class, ClassInput, ScheduleSlot } from '@theall/shared';

interface ClassRow {
  id: string;
  name: string;
  teacher_name: string;
  created_at: string;
  updated_at: string;
}

function loadSchedule(db: Database.Database, classId: string): ScheduleSlot[] {
  const rows = db
    .prepare('SELECT id, day_of_week, start_time, end_time FROM class_schedule_slots WHERE class_id = ?')
    .all(classId) as { id: string; day_of_week: number; start_time: string; end_time: string }[];
  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time
  }));
}

function loadStudentIds(db: Database.Database, classId: string): string[] {
  const rows = db
    .prepare('SELECT student_id FROM class_enrollments WHERE class_id = ?')
    .all(classId) as { student_id: string }[];
  return rows.map((r) => r.student_id);
}

function rowToClass(db: Database.Database, row: ClassRow): Class {
  return {
    id: row.id,
    name: row.name,
    teacherName: row.teacher_name,
    schedule: loadSchedule(db, row.id),
    studentIds: loadStudentIds(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ClassRepository {
  constructor(private db: Database.Database) {}

  create(input: ClassInput): Class {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO classes (id, name, teacher_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, input.name, input.teacherName, now, now);
    this.replaceSchedule(id, input.schedule);
    this.replaceEnrollments(id, input.studentIds ?? []);
    return this.getById(id)!;
  }

  update(id: string, input: ClassInput): Class | undefined {
    if (!this.getById(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE classes SET name = ?, teacher_name = ?, updated_at = ? WHERE id = ?')
      .run(input.name, input.teacherName, now, id);
    this.replaceSchedule(id, input.schedule);
    this.replaceEnrollments(id, input.studentIds ?? []);
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM classes WHERE id = ?').run(id).changes > 0;
  }

  getById(id: string): Class | undefined {
    const row = this.db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as
      | ClassRow
      | undefined;
    return row ? rowToClass(this.db, row) : undefined;
  }

  list(): Class[] {
    const rows = this.db.prepare('SELECT * FROM classes ORDER BY name').all() as ClassRow[];
    return rows.map((row) => rowToClass(this.db, row));
  }

  private replaceSchedule(classId: string, schedule: ClassInput['schedule']): void {
    this.db.prepare('DELETE FROM class_schedule_slots WHERE class_id = ?').run(classId);
    const insert = this.db.prepare(
      'INSERT INTO class_schedule_slots (id, class_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
    );
    for (const slot of schedule) {
      insert.run(randomUUID(), classId, slot.dayOfWeek, slot.startTime, slot.endTime);
    }
  }

  private replaceEnrollments(classId: string, studentIds: string[]): void {
    this.db.prepare('DELETE FROM class_enrollments WHERE class_id = ?').run(classId);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO class_enrollments (class_id, student_id) VALUES (?, ?)'
    );
    for (const studentId of studentIds) {
      insert.run(classId, studentId);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/classRepository.ts server/test/classRepository.test.ts
git commit -m "feat: add ClassRepository with schedule and enrollment"
```

---

## Task 9: Class REST routes + wire into `createApp`

**Files:**
- Create: `server/src/routes/classes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/classesRoute.test.ts`

**Interfaces:**
- Consumes: `ClassRepository` (Task 8), `Broadcaster` (Task 6), `classInputSchema`/`Class` (Task 2).
- Produces: `createClassesRouter(repo, broadcast): Router`.

- [ ] **Step 1: Write the failing tests**

`server/test/classesRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast), broadcast };
}

describe('/classes', () => {
  it('creates and lists a class, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
      });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('classes');

    const listRes = await request(app).get('/classes');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a class with no schedule slots', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/classes')
      .send({ name: '중2 수학', teacherName: '김선생', schedule: [] });
    expect(res.status).toBe(400);
  });

  it('deletes a class', async () => {
    const { app } = buildApp();
    const createRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
      });
    const deleteRes = await request(app).delete(`/classes/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/classes` does not exist yet.

- [ ] **Step 3: Implement the classes router**

`server/src/routes/classes.ts`:
```typescript
import { Router } from 'express';
import { classInputSchema, type ApiResponse, type Class } from '@theall/shared';
import type { ClassRepository } from '../repositories/classRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createClassesRouter(repo: ClassRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<Class[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = classInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const klass = repo.create(parsed.data);
    broadcast('classes');
    const response: ApiResponse<Class> = { success: true, data: klass };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = classInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const klass = repo.update(req.params.id, parsed.data);
    if (!klass) {
      const response: ApiResponse<never> = { success: false, error: 'class not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('classes');
    const response: ApiResponse<Class> = { success: true, data: klass };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'class not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('classes');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

- [ ] **Step 4: Wire it into `createApp`**

`server/src/app.ts` (replace the whole file):
```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import type { Broadcaster } from './broadcast.js';

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));
  app.use('/classes', createClassesRouter(new ClassRepository(db), broadcast));

  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/classes.ts server/src/app.ts server/test/classesRoute.test.ts
git commit -m "feat: add classes REST routes with change broadcast"
```

---

## Task 10: Clinic repository + REST routes

**Files:**
- Create: `server/src/repositories/clinicRepository.ts`
- Create: `server/src/routes/clinics.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/clinicRepository.test.ts`
- Test: `server/test/clinicsRoute.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 4), `ClinicAssignment`/`ClinicAssignmentInput` (Task 2), `Broadcaster` (Task 6).
- Produces: `class ClinicRepository`, `createClinicsRouter(repo, broadcast): Router`.

- [ ] **Step 1: Write the failing repository tests**

`server/test/clinicRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';

describe('ClinicRepository', () => {
  let db: Database.Database;
  let repo: ClinicRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    const students = new StudentRepository(db);
    studentId = students.create({ name: '김민준' }).id;
    repo = new ClinicRepository(db);
  });

  it('creates and retrieves a clinic assignment (no teacher field)', () => {
    const created = repo.create({ studentId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(created).not.toHaveProperty('teacherName');
    expect(repo.getById(created.id)?.studentId).toBe(studentId);
  });

  it('lists assignments ordered by day and time', () => {
    repo.create({ studentId, dayOfWeek: 5, startTime: '18:00', endTime: '19:00' });
    repo.create({ studentId, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });
    const days = repo.list().map((a) => a.dayOfWeek);
    expect(days).toEqual([1, 5]);
  });

  it('deletes an assignment', () => {
    const created = repo.create({ studentId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(repo.delete(created.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL with "Cannot find module '../src/repositories/clinicRepository.js'"

- [ ] **Step 3: Implement the repository**

`server/src/repositories/clinicRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ClinicAssignment, ClinicAssignmentInput } from '@theall/shared';

interface ClinicRow {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

function rowToClinic(row: ClinicRow): ClinicAssignment {
  return {
    id: row.id,
    studentId: row.student_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ClinicRepository {
  constructor(private db: Database.Database) {}

  create(input: ClinicAssignmentInput): ClinicAssignment {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO clinic_assignments (id, student_id, day_of_week, start_time, end_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.studentId, input.dayOfWeek, input.startTime, input.endTime, now, now);
    return this.getById(id)!;
  }

  update(id: string, input: ClinicAssignmentInput): ClinicAssignment | undefined {
    if (!this.getById(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE clinic_assignments SET student_id = ?, day_of_week = ?, start_time = ?, end_time = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(input.studentId, input.dayOfWeek, input.startTime, input.endTime, now, id);
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM clinic_assignments WHERE id = ?').run(id).changes > 0;
  }

  getById(id: string): ClinicAssignment | undefined {
    const row = this.db.prepare('SELECT * FROM clinic_assignments WHERE id = ?').get(id) as
      | ClinicRow
      | undefined;
    return row ? rowToClinic(row) : undefined;
  }

  list(): ClinicAssignment[] {
    const rows = this.db
      .prepare('SELECT * FROM clinic_assignments ORDER BY day_of_week, start_time')
      .all() as ClinicRow[];
    return rows.map(rowToClinic);
  }
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing route tests**

`server/test/clinicsRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast), broadcast };
}

describe('/clinics', () => {
  it('creates and lists a clinic assignment, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/clinics')
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('clinics');

    const listRes = await request(app).get('/clinics');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an invalid time format', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/clinics')
      .send({ studentId: 's1', dayOfWeek: 3, startTime: '6pm', endTime: '19:00' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run route tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/clinics` does not exist yet.

- [ ] **Step 7: Implement the clinics router**

`server/src/routes/clinics.ts`:
```typescript
import { Router } from 'express';
import { clinicAssignmentInputSchema, type ApiResponse, type ClinicAssignment } from '@theall/shared';
import type { ClinicRepository } from '../repositories/clinicRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createClinicsRouter(repo: ClinicRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<ClinicAssignment[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = clinicAssignmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const assignment = repo.create(parsed.data);
    broadcast('clinics');
    const response: ApiResponse<ClinicAssignment> = { success: true, data: assignment };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = clinicAssignmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const assignment = repo.update(req.params.id, parsed.data);
    if (!assignment) {
      const response: ApiResponse<never> = { success: false, error: 'clinic assignment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('clinics');
    const response: ApiResponse<ClinicAssignment> = { success: true, data: assignment };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'clinic assignment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('clinics');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

- [ ] **Step 8: Wire it into `createApp`**

`server/src/app.ts` (replace the whole file):
```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import type { Broadcaster } from './broadcast.js';

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));
  app.use('/classes', createClassesRouter(new ClassRepository(db), broadcast));
  app.use('/clinics', createClinicsRouter(new ClinicRepository(db), broadcast));

  return app;
}
```

- [ ] **Step 9: Run all server tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, ~20)

- [ ] **Step 10: Commit**

```bash
git add server/src/repositories/clinicRepository.ts server/src/routes/clinics.ts server/src/app.ts server/test/clinicRepository.test.ts server/test/clinicsRoute.test.ts
git commit -m "feat: add clinic assignment repository and REST routes"
```

---

## Task 11: Server entrypoint (HTTP + WebSocket)

**Files:**
- Create: `server/src/index.ts`

**Interfaces:**
- Consumes: `createDb` (Task 4), `createApp` (Task 10), `createBroadcaster` (Task 6), `logger` (Task 3).
- Produces: the running process — nothing later imports this file, so no automated test; verified by manual run.

- [ ] **Step 1: Implement the entrypoint**

`server/src/index.ts`:
```typescript
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { createBroadcaster } from './broadcast.js';
import { logger } from './logger.js';

const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.DB_PATH ?? './data.sqlite3';

const db = createDb(DB_PATH);
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });
const broadcast = createBroadcaster(wss);
const app = createApp(db, broadcast);

httpServer.on('request', app);
httpServer.listen(PORT, () => {
  logger.info(`TheAll Messenger server listening on port ${PORT}`);
});
```

- [ ] **Step 2: Verify it runs**

Run: `npm run dev --workspace=server`
Expected: Console prints `[info] TheAll Messenger server listening on port 4000` and `curl http://localhost:4000/health` (in another terminal) returns `{"success":true,"data":{"status":"ok"}}`. Stop the dev server (Ctrl+C) afterward.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add server entrypoint wiring HTTP, WebSocket, and SQLite"
```

---

## Task 12: Desktop scaffold (Electron + Vite + React)

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/vite.config.ts`
- Create: `desktop/index.html`
- Create: `desktop/electron/main.cjs`
- Create: `desktop/src/logger.ts`
- Create: `desktop/src/App.tsx`
- Create: `desktop/src/main.tsx`
- Create: `desktop/test/setup.ts`
- Test: `desktop/test/App.test.tsx`

**Interfaces:**
- Produces: `App` component (empty shell for now; Task 16 fills in the tabs).

- [ ] **Step 1: Scaffold `desktop` package**

`desktop/package.json`:
```json
{
  "name": "@theall/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "electron/main.cjs",
  "scripts": {
    "dev": "concurrently -k \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "test": "vitest run"
  },
  "dependencies": {
    "@theall/shared": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "concurrently": "^9.0.1",
    "electron": "^32.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.1",
    "wait-on": "^8.0.1"
  }
}
```

`desktop/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "test"]
}
```

`desktop/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts']
  }
});
```

`desktop/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>TheAll Messenger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`desktop/electron/main.cjs`:
```javascript
const { app, BrowserWindow } = require('electron');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/index.html');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

`desktop/src/logger.ts`:
```typescript
export const logger = {
  info: (...args: unknown[]): void => console.log('[info]', ...args),
  error: (...args: unknown[]): void => console.error('[error]', ...args)
};
```

`desktop/test/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';

class MockWebSocket {
  addEventListener(): void {}
  close(): void {}
}
// jsdom does not implement WebSocket
(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
```

- [ ] **Step 2: Write the failing shell test**

`desktop/test/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('TheAll Messenger')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL with "Cannot find module '../src/App'"

- [ ] **Step 4: Implement the shell**

`desktop/src/App.tsx`:
```tsx
export function App() {
  return (
    <div>
      <h1>TheAll Messenger</h1>
    </div>
  );
}
```

`desktop/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');
createRoot(container).render(<App />);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm install` (repo root, to link the new workspace), then `npm run test --workspace=desktop`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add desktop
git commit -m "chore: scaffold Electron + Vite + React desktop app"
```

---

## Task 13: Renderer API client + live-refresh hook

**Files:**
- Create: `desktop/src/api/client.ts`
- Create: `desktop/src/api/useLiveRefresh.ts`
- Test: `desktop/test/client.test.ts`

**Interfaces:**
- Consumes: `Student`/`StudentInput`/`Class`/`ClassInput`/`ClinicAssignment`/`ClinicAssignmentInput`/`ApiResponse` (Task 2).
- Produces: `studentsApi`, `classesApi`, `clinicsApi` (each with `list`/`create`/`update`/`remove`), `useLiveRefresh(topic, onChange)`. Tasks 14-16 import these.

- [ ] **Step 1: Write the failing test**

`desktop/test/client.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studentsApi } from '../src/api/client';

describe('studentsApi', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ success: true, data: [{ id: '1', name: '김민준' }] })
      }))
    );
  });

  it('unwraps the ApiResponse envelope on list()', async () => {
    const students = await studentsApi.list();
    expect(students).toEqual([{ id: '1', name: '김민준' }]);
  });

  it('throws when the response is not successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ success: false, error: 'boom' }) }))
    );
    await expect(studentsApi.list()).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL with "Cannot find module '../src/api/client'"

- [ ] **Step 3: Implement the API client**

`desktop/src/api/client.ts`:
```typescript
import type {
  ApiResponse,
  Student,
  StudentInput,
  Class,
  ClassInput,
  ClinicAssignment,
  ClinicAssignmentInput
} from '@theall/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? 'request failed');
  }
  return body.data;
}

export const studentsApi = {
  list: () => request<Student[]>('/students'),
  create: (input: StudentInput) =>
    request<Student>('/students', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: StudentInput) =>
    request<Student>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/students/${id}`, { method: 'DELETE' })
};

export const classesApi = {
  list: () => request<Class[]>('/classes'),
  create: (input: ClassInput) =>
    request<Class>('/classes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ClassInput) =>
    request<Class>(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/classes/${id}`, { method: 'DELETE' })
};

export const clinicsApi = {
  list: () => request<ClinicAssignment[]>('/clinics'),
  create: (input: ClinicAssignmentInput) =>
    request<ClinicAssignment>('/clinics', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ClinicAssignmentInput) =>
    request<ClinicAssignment>(`/clinics/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/clinics/${id}`, { method: 'DELETE' })
};
```

`desktop/src/api/useLiveRefresh.ts`:
```typescript
import { useEffect } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000';

export function useLiveRefresh(
  topic: 'students' | 'classes' | 'clinics',
  onChange: () => void
): void {
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as { type: string; topic: string };
      if (message.type === 'changed' && message.topic === topic) {
        onChange();
      }
    });
    return () => socket.close();
  }, [topic, onChange]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=desktop`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/api desktop/test/client.test.ts
git commit -m "feat: add renderer API client and WebSocket live-refresh hook"
```

---

## Task 14: StudentsPage

**Files:**
- Create: `desktop/src/pages/StudentsPage.tsx`
- Test: `desktop/test/StudentsPage.test.tsx`

**Interfaces:**
- Consumes: `studentsApi`, `useLiveRefresh` (Task 13), `logger` (Task 12).
- Produces: `StudentsPage` component — Task 16 renders it inside `App`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/StudentsPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StudentsPage } from '../src/pages/StudentsPage';
import { studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn()
  }
}));

describe('StudentsPage', () => {
  it('lists students returned from the API', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: '1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);

    render(<StudentsPage />);

    expect(await screen.findByText('김민준')).toBeInTheDocument();
  });

  it('submits the form to create a student', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([]);
    vi.mocked(studentsApi.create).mockResolvedValue({
      id: '2',
      name: '이지은',
      siblingIds: [],
      createdAt: '',
      updatedAt: ''
    });

    render(<StudentsPage />);
    await userEvent.type(screen.getByPlaceholderText('이름'), '이지은');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledWith({ name: '이지은' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=desktop`
Expected: FAIL with "Cannot find module '../src/pages/StudentsPage'"

- [ ] **Step 3: Implement the page**

`desktop/src/pages/StudentsPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Student, StudentInput } from '@theall/shared';
import { studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: StudentInput = { name: '' };

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<StudentInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('students', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      await studentsApi.update(editingId, form);
    } else {
      await studentsApi.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
    refresh();
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setForm({
      name: student.name,
      grade: student.grade,
      schoolName: student.schoolName,
      gender: student.gender,
      phone: student.phone,
      parentPhone: student.parentPhone,
      siblingIds: student.siblingIds
    });
  };

  const handleDelete = async (id: string) => {
    await studentsApi.remove(id);
    refresh();
  };

  return (
    <div>
      <h2>학생</h2>
      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>학년/반</th>
            <th>학교</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>{student.name}</td>
              <td>{student.grade}</td>
              <td>{student.schoolName}</td>
              <td>
                <button onClick={() => handleEdit(student)}>수정</button>
                <button onClick={() => handleDelete(student.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="이름"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="학년/반"
          value={form.grade ?? ''}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
        />
        <input
          placeholder="학교이름"
          value={form.schoolName ?? ''}
          onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
        />
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/StudentsPage.tsx desktop/test/StudentsPage.test.tsx
git commit -m "feat: add StudentsPage CRUD screen"
```

---

## Task 15: ClassesPage

**Files:**
- Create: `desktop/src/pages/ClassesPage.tsx`
- Test: `desktop/test/ClassesPage.test.tsx`

**Interfaces:**
- Consumes: `classesApi`, `useLiveRefresh` (Task 13), `logger` (Task 12).
- Produces: `ClassesPage` component — Task 16 renders it inside `App`.

- [ ] **Step 1: Write the failing test**

`desktop/test/ClassesPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClassesPage } from '../src/pages/ClassesPage';
import { classesApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  classesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ClassesPage', () => {
  it('lists classes with their schedule', async () => {
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: '1',
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ id: 's1', dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<ClassesPage />);

    expect(await screen.findByText('중2 수학')).toBeInTheDocument();
    expect(screen.getByText('2요일 16:00-17:30')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL with "Cannot find module '../src/pages/ClassesPage'"

- [ ] **Step 3: Implement the page**

`desktop/src/pages/ClassesPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Class, ClassInput } from '@theall/shared';
import { classesApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: ClassInput = {
  name: '',
  teacherName: '',
  schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }]
};

export function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [form, setForm] = useState<ClassInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    classesApi.list().then(setClasses).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('classes', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      await classesApi.update(editingId, form);
    } else {
      await classesApi.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
    refresh();
  };

  const handleEdit = (klass: Class) => {
    setEditingId(klass.id);
    setForm({
      name: klass.name,
      teacherName: klass.teacherName,
      schedule: klass.schedule.map(({ dayOfWeek, startTime, endTime }) => ({
        dayOfWeek,
        startTime,
        endTime
      })),
      studentIds: klass.studentIds
    });
  };

  const handleDelete = async (id: string) => {
    await classesApi.remove(id);
    refresh();
  };

  return (
    <div>
      <h2>수업</h2>
      <table>
        <thead>
          <tr>
            <th>수업명</th>
            <th>담당 선생님</th>
            <th>요일/시간</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <tr key={klass.id}>
              <td>{klass.name}</td>
              <td>{klass.teacherName}</td>
              <td>
                {klass.schedule
                  .map((slot) => `${slot.dayOfWeek}요일 ${slot.startTime}-${slot.endTime}`)
                  .join(', ')}
              </td>
              <td>
                <button onClick={() => handleEdit(klass)}>수정</button>
                <button onClick={() => handleDelete(klass.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="수업명"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="담당 선생님"
          value={form.teacherName}
          onChange={(e) => setForm({ ...form, teacherName: e.target.value })}
          required
        />
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=desktop`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/ClassesPage.tsx desktop/test/ClassesPage.test.tsx
git commit -m "feat: add ClassesPage CRUD screen"
```

---

## Task 16: ClinicPage + App shell navigation

**Files:**
- Create: `desktop/src/pages/ClinicPage.tsx`
- Modify: `desktop/src/App.tsx`
- Test: `desktop/test/ClinicPage.test.tsx`
- Modify: `desktop/test/App.test.tsx`

**Interfaces:**
- Consumes: `clinicsApi`, `studentsApi`, `useLiveRefresh` (Task 13), `logger` (Task 12), `StudentsPage` (Task 14), `ClassesPage` (Task 15).
- Produces: `ClinicPage` component; `App` now renders a tabbed shell instead of the placeholder heading.

- [ ] **Step 1: Write the failing ClinicPage test**

`desktop/test/ClinicPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClinicPage } from '../src/pages/ClinicPage';
import { clinicsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  clinicsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ClinicPage', () => {
  it('shows the assigned student name instead of a raw id', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([
      { id: 'c1', studentId: 's1', dayOfWeek: 3, startTime: '18:00', endTime: '19:00', createdAt: '', updatedAt: '' }
    ]);

    render(<ClinicPage />);

    expect(await screen.findByText('김민준')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL with "Cannot find module '../src/pages/ClinicPage'"

- [ ] **Step 3: Implement ClinicPage**

`desktop/src/pages/ClinicPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type { ClinicAssignment, ClinicAssignmentInput, Student } from '@theall/shared';
import { clinicsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: ClinicAssignmentInput = {
  studentId: '',
  dayOfWeek: 1,
  startTime: '18:00',
  endTime: '19:00'
};

export function ClinicPage() {
  const [assignments, setAssignments] = useState<ClinicAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<ClinicAssignmentInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    clinicsApi.list().then(setAssignments).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('clinics', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      await clinicsApi.update(editingId, form);
    } else {
      await clinicsApi.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
    refresh();
  };

  const handleEdit = (assignment: ClinicAssignment) => {
    setEditingId(assignment.id);
    setForm({
      studentId: assignment.studentId,
      dayOfWeek: assignment.dayOfWeek,
      startTime: assignment.startTime,
      endTime: assignment.endTime
    });
  };

  const handleDelete = async (id: string) => {
    await clinicsApi.remove(id);
    refresh();
  };

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <h2>클리닉</h2>
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>요일/시간</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td>{studentName(assignment.studentId)}</td>
              <td>
                {assignment.dayOfWeek}요일 {assignment.startTime}-{assignment.endTime}
              </td>
              <td>
                <button onClick={() => handleEdit(assignment)}>수정</button>
                <button onClick={() => handleDelete(assignment.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleSubmit}>
        <select
          value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          required
        >
          <option value="">학생 선택</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run ClinicPage test to verify it passes**

Run: `npm run test --workspace=desktop`
Expected: PASS (1 test)

- [ ] **Step 5: Update the App shell test**

`desktop/test/App.test.tsx` (replace the whole file):
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('App', () => {
  it('shows the students tab by default and switches to classes on click', async () => {
    render(<App />);
    expect(await screen.findByText('학생')).toBeInTheDocument();

    await userEvent.click(screen.getByText('수업'));
    expect(await screen.findByText('담당 선생님')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `App` still renders only the placeholder heading, no tabs.

- [ ] **Step 7: Implement the tabbed shell**

`desktop/src/App.tsx`:
```tsx
import { useState } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';

type Tab = 'students' | 'classes' | 'clinics';

export function App() {
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div>
      <nav>
        <button onClick={() => setTab('students')}>학생</button>
        <button onClick={() => setTab('classes')}>수업</button>
        <button onClick={() => setTab('clinics')}>클리닉</button>
      </nav>
      {tab === 'students' && <StudentsPage />}
      {tab === 'classes' && <ClassesPage />}
      {tab === 'clinics' && <ClinicPage />}
    </div>
  );
}
```

- [ ] **Step 8: Run all desktop tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full app manually**

Run (terminal 1): `npm run dev --workspace=server`
Run (terminal 2): `npm run dev --workspace=desktop`
Expected: An Electron window opens showing the 학생/수업/클리닉 tabs; creating a student in the form appears in the table immediately.

- [ ] **Step 10: Commit**

```bash
git add desktop/src/pages/ClinicPage.tsx desktop/src/App.tsx desktop/test/ClinicPage.test.tsx desktop/test/App.test.tsx
git commit -m "feat: add ClinicPage and tabbed app shell"
```

---

## Out of scope for this plan

- Deploying the server into the academy NAS's Container Manager (Dockerfile, NAS-specific config) — deferred until more sub-projects exist, per the design spec.
- Attendance logging, schedule exceptions, no-show alerts, handover notes, calendar/export views — each is its own sub-project plan per the design spec's decomposition.
- Auth/token setup for the API — the spec defers this; this plan's server has no auth yet and should only be run on a trusted local/LAN network during development.
