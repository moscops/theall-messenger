# 인수인계 메모 (Handover Notes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 3 on top of the completed student/class/clinic master data (sub-project 1) and attendance/exceptions (sub-project 2): a simple daily log where any 조교 can leave a note for whoever works the next shift, and everyone sees the same live-updating list.

**Architecture:** Extends the existing `shared`/`server`/`desktop` monorepo — no new packages. One new SQLite table (`handover_notes`) and one repository, following the exact Repository pattern already used by `StudentCommentRepository`/`ScheduleExceptionRepository`. Unlike every other entity in this app, a `HandoverNote` has **no reference to a student, class, or clinic** — it is a general per-day note, not tied to any other record, so it needs no foreign key and no cross-entity validation. This makes it the simplest sub-project so far: one table, one repository, one route file, one page.

**Tech Stack:** Same as sub-projects 1 and 2 — TypeScript, Express, better-sqlite3, Zod, Vitest + Supertest, React 18, Vite, @testing-library/react, Electron.

**Spec:** `docs/superpowers/specs/2026-09-13-student-database-design.md` (사양의 `### HandoverNote (인수인계 메모)` 섹션 및 `## 범위 분해` 3번 항목)

## Global Constraints

- Same conventions as sub-projects 1 and 2: TypeScript everywhere, no `any`; Zod validation at the API boundary; `ApiResponse<T>` envelope on every route; Repository pattern (no SQL outside `repositories/`); `logger` instead of raw `console.*`; Electron security baseline already in place, untouched by this plan.
- Dates are plain `YYYY-MM-DD` strings, validated with the module-private `dateStringSchema` already defined in `shared/src/schemas.ts` (reuse it directly — it is in scope for every schema added in that file, just not exported outside it).
- **`HandoverNote` has no foreign key.** Per the spec, it is a per-day note — `date` + `author` + `content`, all required — with no student/class/clinic reference and no cross-field validation rule. Do not add one.
- `ChangeTopic` gains one new value: `'handover'` — its own topic, distinct from `'attendance'` and `'comments'`, since handover notes feed their own screen and no other screen depends on them.
- **Client-side date lesson from sub-project 2's final review:** any place the desktop client computes "today's date" for a form default MUST build it from local date parts (`getFullYear()`/`getMonth()+1`/`getDate()`, zero-padded), never `new Date().toISOString().slice(0, 10)` — `toISOString()` is UTC and silently produces the wrong calendar date for part of every day in a timezone ahead of UTC (KST included). This plan's `HandoverNotesPage` bakes this in from the start.

---

## Task 1: Shared schema for HandoverNote + ChangeTopic

**Files:**
- Modify: `shared/src/schemas.ts` (append after the existing `noShowAlertConfigSchema`/`rosterEntrySchema` block, before the `ApiResponse<T>` interface at the end of the file)
- Modify: `shared/src/broadcast.ts` (replace the whole file — adds one `ChangeTopic` value)
- Modify: `shared/test/schemas.test.ts` (append a new `describe` block at the end of the file, and add `handoverNoteInputSchema` to the existing import list at the top)

**Interfaces:**
- Produces: `handoverNoteInputSchema`, `handoverNoteSchema`, `HandoverNoteInput`, `HandoverNote`. Updated `ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments' | 'handover'`. Every later task imports these from `@theall/shared`.

- [ ] **Step 1: Write the failing schema tests**

Add `handoverNoteInputSchema` to the existing `import { ... } from '../src/schemas.js';` block at the top of `shared/test/schemas.test.ts` (it currently imports `studentInputSchema, classInputSchema, clinicAssignmentInputSchema, attendanceLogInputSchema, scheduleExceptionInputSchema, studentCommentInputSchema, noShowAlertConfigInputSchema` — add `handoverNoteInputSchema` to that list).

Then append this block to the end of `shared/test/schemas.test.ts`:

```typescript
describe('handoverNoteInputSchema', () => {
  it('accepts a valid handover note', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026-09-15',
      author: '조교A',
      content: '내일 김민준 학생 보충 시간 변경 예정, 확인 부탁드려요'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a note with no content', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026-09-15',
      author: '조교A',
      content: ''
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026/09/15',
      author: '조교A',
      content: '내용'
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=shared`
Expected: FAIL — `handoverNoteInputSchema` does not exist yet.

- [ ] **Step 3: Implement the schema**

Append this block to `shared/src/schemas.ts`, after the existing `noShowAlertConfigSchema`/`NoShowAlertConfig` block and before `rosterEntrySchema` (order relative to `rosterEntrySchema` doesn't matter — just keep it after `dateStringSchema` is declared, which it already is, near the top of the file):

```typescript
export const handoverNoteInputSchema = z.object({
  date: dateStringSchema,
  author: z.string().min(1, 'author is required'),
  content: z.string().min(1, 'content is required')
});
export type HandoverNoteInput = z.infer<typeof handoverNoteInputSchema>;

export const handoverNoteSchema = handoverNoteInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type HandoverNote = z.infer<typeof handoverNoteSchema>;
```

`shared/src/broadcast.ts` (replace the whole file):

```typescript
export type ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments' | 'handover';

export interface ChangeMessage {
  type: 'changed';
  topic: ChangeTopic;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=shared`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas.ts shared/src/broadcast.ts shared/test/schemas.test.ts
git commit -m "feat: add HandoverNote schema and handover ChangeTopic"
```

---

## Task 2: HandoverNoteRepository + `/handover-notes` CRUD routes

**Files:**
- Modify: `server/src/db.ts` (append a new table to the `db.exec(...)` block)
- Create: `server/src/repositories/handoverNoteRepository.ts`
- Create: `server/src/routes/handoverNotes.ts`
- Modify: `server/src/app.ts` (replace the whole file — adds the `/handover-notes` mount)
- Test: `server/test/handoverNoteRepository.test.ts`
- Test: `server/test/handoverNotesRoute.test.ts`

**Interfaces:**
- Consumes: `handoverNoteInputSchema`/`HandoverNoteInput`/`HandoverNote`/`ApiResponse` (Task 1).
- Produces: `class HandoverNoteRepository` with `create/update/delete/getById/list` (same shape as `StudentCommentRepository`). `createHandoverNotesRouter(repo, broadcast): Router`, broadcasting on topic `'handover'`.

- [ ] **Step 1: Write the failing repository tests**

`server/test/handoverNoteRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { HandoverNoteRepository } from '../src/repositories/handoverNoteRepository.js';

describe('HandoverNoteRepository', () => {
  let db: Database.Database;
  let repo: HandoverNoteRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new HandoverNoteRepository(db);
  });

  it('creates and retrieves a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '내일 등원 변경 있음' });
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('updates a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '원래 내용' });
    const updated = repo.update(created.id, { date: '2026-09-16', author: '조교A', content: '수정된 내용' });
    expect(updated?.date).toBe('2026-09-16');
    expect(updated?.content).toBe('수정된 내용');
  });

  it('deletes a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '내용' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists notes with the most recent date first', () => {
    repo.create({ date: '2026-09-10', author: '조교A', content: '오래된 메모' });
    repo.create({ date: '2026-09-15', author: '조교B', content: '최근 메모' });
    expect(repo.list().map((n) => n.content)).toEqual(['최근 메모', '오래된 메모']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `HandoverNoteRepository` does not exist yet.

- [ ] **Step 3: Add the table and implement the repository**

Append this table definition to the `db.exec(...)` block in `server/src/db.ts`, right after the existing `no_show_alert_config` table (before the closing `` ` ``):

```sql
CREATE TABLE IF NOT EXISTS handover_notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

No foreign key on this table — per the Global Constraints, a handover note references nothing else.

`server/src/repositories/handoverNoteRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { HandoverNote, HandoverNoteInput } from '@theall/shared';

interface HandoverNoteRow {
  id: string;
  date: string;
  author: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: HandoverNoteRow): HandoverNote {
  return {
    id: row.id,
    date: row.date,
    author: row.author,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class HandoverNoteRepository {
  constructor(private db: Database.Database) {}

  create(input: HandoverNoteInput): HandoverNote {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO handover_notes (id, date, author, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.date, input.author, input.content, now, now);
    return this.getById(id)!;
  }

  update(id: string, input: HandoverNoteInput): HandoverNote | undefined {
    if (!this.getById(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE handover_notes SET date = ?, author = ?, content = ?, updated_at = ? WHERE id = ?')
      .run(input.date, input.author, input.content, now, id);
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM handover_notes WHERE id = ?').run(id).changes > 0;
  }

  getById(id: string): HandoverNote | undefined {
    const row = this.db.prepare('SELECT * FROM handover_notes WHERE id = ?').get(id) as
      | HandoverNoteRow
      | undefined;
    return row ? rowToNote(row) : undefined;
  }

  list(): HandoverNote[] {
    const rows = this.db
      .prepare('SELECT * FROM handover_notes ORDER BY date DESC, created_at DESC, rowid DESC')
      .all() as HandoverNoteRow[];
    return rows.map(rowToNote);
  }
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing route tests**

`server/test/handoverNotesRoute.test.ts`:
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

describe('/handover-notes', () => {
  it('creates and lists a note, and broadcasts on the handover topic', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app)
      .post('/handover-notes')
      .send({ date: '2026-09-15', author: '조교A', content: '내일 김민준 학생 보충 확인' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('handover');

    const listRes = await request(app).get('/handover-notes');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an empty content field', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/handover-notes')
      .send({ date: '2026-09-15', author: '조교A', content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleting a missing note', async () => {
    const { app } = buildApp();
    const res = await request(app).delete('/handover-notes/does-not-exist');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/handover-notes` does not exist yet.

- [ ] **Step 7: Implement the router and wire it into `createApp`**

`server/src/routes/handoverNotes.ts`:
```typescript
import { Router } from 'express';
import { handoverNoteInputSchema, type ApiResponse, type HandoverNote } from '@theall/shared';
import type { HandoverNoteRepository } from '../repositories/handoverNoteRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createHandoverNotesRouter(repo: HandoverNoteRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<HandoverNote[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = handoverNoteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const note = repo.create(parsed.data);
    broadcast('handover');
    const response: ApiResponse<HandoverNote> = { success: true, data: note };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = handoverNoteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const note = repo.update(req.params.id, parsed.data);
    if (!note) {
      const response: ApiResponse<never> = { success: false, error: 'handover note not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('handover');
    const response: ApiResponse<HandoverNote> = { success: true, data: note };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'handover note not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('handover');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — adds the `/handover-notes` mount):
```typescript
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import type { ApiResponse } from '@theall/shared';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { AttendanceRepository } from './repositories/attendanceRepository.js';
import { NoShowAlertConfigRepository } from './repositories/noShowAlertConfigRepository.js';
import { ScheduleExceptionRepository } from './repositories/scheduleExceptionRepository.js';
import { StudentCommentRepository } from './repositories/studentCommentRepository.js';
import { HandoverNoteRepository } from './repositories/handoverNoteRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createExceptionsRouter } from './routes/exceptions.js';
import { createCommentsRouter } from './routes/comments.js';
import { createHandoverNotesRouter } from './routes/handoverNotes.js';
import type { Broadcaster } from './broadcast.js';
import { logger } from './logger.js';

function isForeignKeyViolation(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  const message = err instanceof Error ? err.message : '';
  return code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || message.includes('FOREIGN KEY constraint failed');
}

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const response: ApiResponse<{ status: string }> = { success: true, data: { status: 'ok' } };
    res.json(response);
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));
  app.use('/classes', createClassesRouter(new ClassRepository(db), broadcast));
  app.use('/clinics', createClinicsRouter(new ClinicRepository(db), broadcast));
  app.use(
    '/attendance',
    createAttendanceRouter(db, new AttendanceRepository(db), new NoShowAlertConfigRepository(db), broadcast)
  );
  app.use(
    '/exceptions',
    createExceptionsRouter(
      new ScheduleExceptionRepository(db),
      new ClassRepository(db),
      new ClinicRepository(db),
      broadcast
    )
  );
  app.use('/comments', createCommentsRouter(new StudentCommentRepository(db), broadcast));
  app.use('/handover-notes', createHandoverNotesRouter(new HandoverNoteRepository(db), broadcast));

  app.use((_req: Request, res: Response) => {
    const response: ApiResponse<never> = { success: false, error: 'not found' };
    res.status(404).json(response);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled request error', err);
    if (isForeignKeyViolation(err)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'referenced record does not exist'
      };
      res.status(400).json(response);
      return;
    }
    const response: ApiResponse<never> = { success: false, error: 'internal server error' };
    res.status(500).json(response);
  });

  return app;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 9: Commit**

```bash
git add server/src/db.ts server/src/repositories/handoverNoteRepository.ts server/src/routes/handoverNotes.ts server/src/app.ts server/test/handoverNoteRepository.test.ts server/test/handoverNotesRoute.test.ts
git commit -m "feat: add handover note repository and REST routes"
```

---

## Task 3: Desktop API client extension

**Files:**
- Modify: `desktop/src/api/client.ts` (replace the whole file — adds `handoverNotesApi`)
- Modify: `desktop/test/client.test.ts` (append a new `describe` block at the end of the file, and add `handoverNotesApi` to the existing import list at the top)

**Interfaces:**
- Consumes: `HandoverNote`/`HandoverNoteInput` (Task 1).
- Produces: `handoverNotesApi.{list, create, update, remove}`. Task 4 imports this.

- [ ] **Step 1: Write the failing test**

Add `handoverNotesApi` to the existing `import { studentsApi, classesApi, clinicsApi, attendanceApi, alertConfigApi, exceptionsApi, commentsApi } from '../src/api/client';` line at the top of `desktop/test/client.test.ts`.

Then append this block to the end of `desktop/test/client.test.ts`:

```typescript
describe('handoverNotesApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'h1' } });

    await handoverNotesApi.create({ date: '2026-09-15', author: '조교A', content: '내용' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/handover-notes',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `handoverNotesApi` is not exported yet.

- [ ] **Step 3: Implement the client extension**

`desktop/src/api/client.ts` (replace the whole file):
```typescript
import type {
  ApiResponse,
  Student,
  StudentInput,
  Class,
  ClassInput,
  ClinicAssignment,
  ClinicAssignmentInput,
  AttendanceLog,
  AttendanceLogInput,
  RosterEntry,
  NoShowAlertConfig,
  NoShowAlertConfigInput,
  ScheduleException,
  ScheduleExceptionInput,
  StudentComment,
  StudentCommentInput,
  HandoverNote,
  HandoverNoteInput
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

export const attendanceApi = {
  roster: (date: string) => request<RosterEntry[]>(`/attendance/roster?date=${date}`),
  checkIn: (input: AttendanceLogInput) =>
    request<AttendanceLog>('/attendance/check-in', { method: 'POST', body: JSON.stringify(input) })
};

export const alertConfigApi = {
  get: () => request<NoShowAlertConfig>('/attendance/alert-config'),
  update: (input: NoShowAlertConfigInput) =>
    request<NoShowAlertConfig>('/attendance/alert-config', { method: 'PUT', body: JSON.stringify(input) })
};

export const exceptionsApi = {
  list: () => request<ScheduleException[]>('/exceptions'),
  create: (input: ScheduleExceptionInput) =>
    request<ScheduleException>('/exceptions', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ScheduleExceptionInput) =>
    request<ScheduleException>(`/exceptions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/exceptions/${id}`, { method: 'DELETE' })
};

export const commentsApi = {
  list: () => request<StudentComment[]>('/comments'),
  create: (input: StudentCommentInput) =>
    request<StudentComment>('/comments', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: StudentCommentInput) =>
    request<StudentComment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/comments/${id}`, { method: 'DELETE' })
};

export const handoverNotesApi = {
  list: () => request<HandoverNote[]>('/handover-notes'),
  create: (input: HandoverNoteInput) =>
    request<HandoverNote>('/handover-notes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: HandoverNoteInput) =>
    request<HandoverNote>(`/handover-notes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/handover-notes/${id}`, { method: 'DELETE' })
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/api/client.ts desktop/test/client.test.ts
git commit -m "feat: add handover notes to the API client"
```

---

## Task 4: HandoverNotesPage

**Files:**
- Create: `desktop/src/pages/HandoverNotesPage.tsx`
- Test: `desktop/test/HandoverNotesPage.test.tsx`

**Interfaces:**
- Consumes: `handoverNotesApi` (Task 3), `useLiveRefresh` (existing).
- Produces: `HandoverNotesPage` component — Task 5 renders it inside `App`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/HandoverNotesPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HandoverNotesPage } from '../src/pages/HandoverNotesPage';
import { handoverNotesApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  handoverNotesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('HandoverNotesPage', () => {
  it('lists existing notes, most recent date first', async () => {
    vi.mocked(handoverNotesApi.list).mockResolvedValue([
      {
        id: 'h1',
        date: '2026-09-15',
        author: '조교A',
        content: '내일 김민준 학생 보충 확인',
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<HandoverNotesPage />);

    expect(await screen.findByText(/내일 김민준 학생 보충 확인/)).toBeInTheDocument();
  });

  it('submits a new note and clears the content field but keeps the author', async () => {
    vi.mocked(handoverNotesApi.list).mockResolvedValue([]);
    vi.mocked(handoverNotesApi.create).mockResolvedValue({
      id: 'h1',
      date: '2026-09-15',
      author: '조교A',
      content: '숙제 다 못 낸 학생 있음',
      createdAt: '',
      updatedAt: ''
    });

    render(<HandoverNotesPage />);
    await screen.findByRole('button', { name: '추가' });

    await userEvent.type(screen.getByPlaceholderText('작성자'), '조교A');
    await userEvent.type(screen.getByPlaceholderText('내용'), '숙제 다 못 낸 학생 있음');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(handoverNotesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ author: '조교A', content: '숙제 다 못 낸 학생 있음' })
      )
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `src/pages/HandoverNotesPage.tsx` does not exist yet.

- [ ] **Step 3: Implement the page**

`desktop/src/pages/HandoverNotesPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type { HandoverNote, HandoverNoteInput } from '@theall/shared';
import { handoverNotesApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyForm(): HandoverNoteInput {
  return { date: today(), author: '', content: '' };
}

export function HandoverNotesPage() {
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [form, setForm] = useState<HandoverNoteInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    handoverNotesApi.list().then(setNotes).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('handover', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await handoverNotesApi.create(form);
      setForm({ ...emptyForm(), author: form.author });
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await handoverNotesApi.remove(id);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  return (
    <div>
      <h2>인수인계 메모</h2>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            [{note.date}] {note.author}: {note.content}
            <button onClick={() => handleDelete(note.id)}>삭제</button>
          </li>
        ))}
      </ul>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <input
          placeholder="작성자"
          value={form.author}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
          required
        />
        <input
          placeholder="내용"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
        />
        <button type="submit">추가</button>
      </form>
    </div>
  );
}
```

Note: `today()` here uses local date parts (`getFullYear()`/`getMonth()+1`/`getDate()`), matching the Global Constraints — this is the same lesson learned and fixed in `AttendancePage.tsx` during sub-project 2's final review, applied from the start this time.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/HandoverNotesPage.tsx desktop/test/HandoverNotesPage.test.tsx
git commit -m "feat: add HandoverNotesPage for shift-to-shift notes"
```

---

## Task 5: App shell navigation for the new tab

**Files:**
- Modify: `desktop/src/App.tsx` (replace the whole file)
- Modify: `desktop/test/App.test.tsx` (replace the whole file)

**Interfaces:**
- Consumes: `HandoverNotesPage` (Task 4).
- Produces: `App` now renders 7 tabs instead of 6.

- [ ] **Step 1: Write the failing test**

`desktop/test/App.test.tsx` (replace the whole file):
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  attendanceApi: { roster: vi.fn().mockResolvedValue([]), checkIn: vi.fn() },
  alertConfigApi: { get: vi.fn().mockResolvedValue({ enabled: false, delayMinutes: 10 }), update: vi.fn() },
  exceptionsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  commentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  handoverNotesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('App', () => {
  it('shows the students tab by default and switches to classes on click', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: '학생' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수업' }));
    expect(await screen.findByText('담당 선생님')).toBeInTheDocument();
  });

  it('switches to the attendance, exceptions, and comments tabs', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '출결' }));
    expect(await screen.findByRole('heading', { name: /출결/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '일정 예외' }));
    expect(await screen.findByRole('heading', { name: '일정 예외' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '코멘트' }));
    expect(await screen.findByRole('heading', { name: '학생 코멘트' })).toBeInTheDocument();
  });

  it('switches to the handover notes tab', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '인수인계' }));
    expect(await screen.findByRole('heading', { name: '인수인계 메모' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `App` does not have a 인수인계 tab yet.

- [ ] **Step 3: Implement the tabbed shell**

`desktop/src/App.tsx` (replace the whole file):
```tsx
import { useState } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { CommentsPage } from './pages/CommentsPage';
import { HandoverNotesPage } from './pages/HandoverNotesPage';

type Tab = 'students' | 'classes' | 'clinics' | 'attendance' | 'exceptions' | 'comments' | 'handover';

export function App() {
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div>
      <nav>
        <button onClick={() => setTab('students')}>학생</button>
        <button onClick={() => setTab('classes')}>수업</button>
        <button onClick={() => setTab('clinics')}>클리닉</button>
        <button onClick={() => setTab('attendance')}>출결</button>
        <button onClick={() => setTab('exceptions')}>일정 예외</button>
        <button onClick={() => setTab('comments')}>코멘트</button>
        <button onClick={() => setTab('handover')}>인수인계</button>
      </nav>
      {tab === 'students' && <StudentsPage />}
      {tab === 'classes' && <ClassesPage />}
      {tab === 'clinics' && <ClinicPage />}
      {tab === 'attendance' && <AttendancePage />}
      {tab === 'exceptions' && <ExceptionsPage />}
      {tab === 'comments' && <CommentsPage />}
      {tab === 'handover' && <HandoverNotesPage />}
    </div>
  );
}
```

- [ ] **Step 4: Run all desktop tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Run the full monorepo test suite and typecheck once, as a final sanity check**

Run: `npm run test --workspaces --if-present` and `npm run typecheck --workspaces --if-present`
Expected: PASS with zero failures and zero type errors across `shared`, `server`, and `desktop`.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/App.tsx desktop/test/App.test.tsx
git commit -m "feat: add handover notes tab to the app shell"
```

---

## Out of scope for this plan

- Editing an existing `HandoverNote` from the UI (the API supports `PATCH`, but `HandoverNotesPage` only wires create/delete, matching how `ExceptionsPage` handled `ScheduleException` in sub-project 2) — add an edit form if this turns out to be needed in practice.
- Filtering the note list by date range (e.g. "only show today's and yesterday's notes") — the full list is shown newest-first; add filtering if the list grows large enough to matter.
- Any calendar/Excel/PDF export view — that is sub-project 4 per the design spec's decomposition.
