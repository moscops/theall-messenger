# Schedule Exception Slot Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a live bug where a schedule exception (absence/reschedule) aimed at one occurrence of a class that meets more than once on the same weekday incorrectly matches — and removes/recolors — every same-weekday slot of that class, by letting an exception optionally target one specific `class_schedule_slots` row.

**Architecture:** Add an optional `classScheduleSlotId` field to `ScheduleException`/`ScheduleExceptionInput`, threaded through the shared schema, the SQLite column, the repository, and route validation. `null`/unset preserves today's behavior (an exception matches every same-weekday slot of the target class — the correct, and only possible, behavior for clinics, and the safe default for legacy class exceptions). A set value narrows matching to that one slot. `computeRoster` and `computeCalendarEvents` — the two read-model services that already independently implement this matching — get the identical fix, since both currently share the same underlying bug. The desktop `ExceptionsPage` form gains a slot picker, shown only when the chosen class has more than one schedule slot.

**Tech Stack:** TypeScript, Zod, Express 4, better-sqlite3, React 18, Vitest, Testing Library.

**Spec:** None — this is a scoped bug fix designed and approved in chat (bounded classification: the flows it touches — `ScheduleException`, `computeRoster`, `computeCalendarEvents`, the exceptions route, and `ExceptionsPage` — already exist in full from sub-projects 2 and 4). The design agreed with the user is captured below in Global Constraints; there is no separate spec document for this plan.

## Global Constraints

- New field `classScheduleSlotId?: string` on `ScheduleExceptionInput` and `ScheduleException` (`shared/src/schemas.ts`). Meaningful only when `targetType === 'class'`.
- Unset/`null` `classScheduleSlotId` matches every same-weekday slot of the target class (today's behavior, kept as the default — this is the *only* possible behavior for clinics, since a clinic assignment has no separate "slot" concept beyond itself).
- A set `classScheduleSlotId` matches only that one `class_schedule_slots.id`. This is what fixes the bug: a class with two or more same-weekday slots no longer loses every occurrence to a single exception.
- New nullable column on `schedule_exceptions`: `class_schedule_slot_id TEXT REFERENCES class_schedule_slots(id) ON DELETE SET NULL` (`server/src/db.ts`). **Correction made during the final whole-branch review:** this plan originally claimed no live database file existed anywhere on disk — that was false. A gitignored `server/data.sqlite3` exists in the main checkout (found by the review's own inspection, missed by this plan's own pre-writing check because that check searched for `*.sqlite`/`*.db` and never `*.sqlite3`, the actual extension `server/src/index.ts` defaults to). `CREATE TABLE IF NOT EXISTS` is a silent no-op against an already-existing table, so the column addition needs an idempotent `PRAGMA table_info` + conditional `ALTER TABLE ADD COLUMN` guard in `createDb` as well — see Task 2's implementation below, which includes this guard.
- `server/src/services/roster.ts` (shipped in sub-project 2) and `server/src/services/calendar.ts` (shipped in sub-project 4) both currently implement the same unqualified `(student_id, target_type, target_id)` matching and both get the identical slot-aware fix — this bug is pre-existing in both, not new to either.
- `RosterEntry` and `CalendarEvent` (both in `shared/src/schemas.ts`) are **not** modified. The slot id is purely an internal matching detail inside `computeRoster`/`computeCalendarEvents` and is never part of either public shape — this mirrors the standing ruling from sub-project 4's final review that slot id is an implementation detail, not an API field.
- Known, accepted, out-of-scope limitation: `ClassRepository.update()` (`server/src/repositories/classRepository.ts:89-97`, unmodified by this plan) deletes and recreates every one of a class's `class_schedule_slots` rows — with brand-new random ids — on every edit, even when the schedule itself didn't change. Combined with `ON DELETE SET NULL`, editing a class after creating a slot-specific exception against it silently reverts that exception back to "matches every slot" (no crash, no orphaned foreign key — just quiet loss of precision until the exception is recreated). This plan does not change `ClassRepository`; it is a pre-existing repository behavior, unrelated to the bug being fixed here.
- Desktop: the new slot picker in `ExceptionsPage.tsx` renders only when the selected class's `schedule` array has more than one entry — a single-slot class has nothing to disambiguate, so showing the picker there would only add friction.

---

### Task 1: Shared schema — `classScheduleSlotId` field

**Files:**
- Modify: `shared/src/schemas.ts`
- Test: `shared/test/schemas.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ScheduleExceptionInput['classScheduleSlotId']: string | undefined` and `ScheduleException['classScheduleSlotId']: string | undefined` — every later task (repository, route, roster/calendar services, desktop form) reads or writes this exact field name.

- [ ] **Step 1: Write the failing test**

Add to `shared/test/schemas.test.ts`, inside the existing `describe('scheduleExceptionInputSchema', ...)` block (after the last `it(...)`, before the closing `});` of that block):

```typescript
  it('accepts an absence with a classScheduleSlotId', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      classScheduleSlotId: 'slot1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.classScheduleSlotId).toBe('slot1');
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=shared`
Expected: FAIL on `expect(result.data.classScheduleSlotId).toBe('slot1')` — the schema doesn't declare the field yet, so Zod's default object parsing strips it and `result.data.classScheduleSlotId` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `shared/src/schemas.ts`, modify `scheduleExceptionInputSchema` (add the new field inside the `z.object({...})`, right after `newEndTime`):

```typescript
export const scheduleExceptionInputSchema = z
  .object({
    studentId: z.string().min(1, 'studentId is required'),
    targetType: scheduleExceptionTargetTypeSchema,
    targetId: z.string().min(1, 'targetId is required'),
    exceptionType: scheduleExceptionTypeSchema,
    date: dateStringSchema,
    reason: z.string().optional(),
    newDate: dateStringSchema.optional(),
    newStartTime: timeSchema.optional(),
    newEndTime: timeSchema.optional(),
    classScheduleSlotId: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.exceptionType === 'reschedule') {
        return Boolean(data.newDate && data.newStartTime && data.newEndTime);
      }
      if (data.exceptionType === 'makeup') {
        return Boolean(data.newStartTime && data.newEndTime);
      }
      return true;
    },
    { message: 'reschedule and makeup exceptions require new time information' }
  );
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionInputSchema>;
```

And modify `scheduleExceptionSchema` (add the field right after `newEndTime`):

```typescript
export const scheduleExceptionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  targetType: scheduleExceptionTargetTypeSchema,
  targetId: z.string(),
  exceptionType: scheduleExceptionTypeSchema,
  date: z.string(),
  reason: z.string().optional(),
  newDate: z.string().optional(),
  newStartTime: z.string().optional(),
  newEndTime: z.string().optional(),
  classScheduleSlotId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=shared`
Expected: PASS (all tests in `shared/test/schemas.test.ts`, including the new one).

- [ ] **Step 5: Run the shared typecheck**

Run: `npm run typecheck --workspace=shared`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas.ts shared/test/schemas.test.ts
git commit -m "feat(shared): add optional classScheduleSlotId to ScheduleException

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

### Task 2: DB column + repository read/write

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/repositories/scheduleExceptionRepository.ts`
- Test: `server/test/scheduleExceptionRepository.test.ts`

**Interfaces:**
- Consumes: `ScheduleExceptionInput['classScheduleSlotId']` / `ScheduleException['classScheduleSlotId']` from Task 1.
- Produces: the `schedule_exceptions.class_schedule_slot_id` column, and `ScheduleExceptionRepository.create`/`update`/`getById`/`list` all round-tripping `classScheduleSlotId` — Task 3 (route validation) and Tasks 4-5 (roster/calendar SQL) both read this column directly.

- [ ] **Step 1: Write the failing test**

Add to `server/test/scheduleExceptionRepository.test.ts`, inside the `describe('ScheduleExceptionRepository', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('creates and retrieves an exception with a classScheduleSlotId', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      classScheduleSlotId: 'slot1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(created.classScheduleSlotId).toBe('slot1');
    expect(repo.getById(created.id)?.classScheduleSlotId).toBe('slot1');
  });

  it('leaves classScheduleSlotId undefined when not provided', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(created.classScheduleSlotId).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- scheduleExceptionRepository`
Expected: FAIL on the first new test — `created.classScheduleSlotId` is `undefined` because the repository doesn't read/write it yet.

- [ ] **Step 3: Write minimal implementation**

In `server/src/db.ts`, modify the `schedule_exceptions` table definition to add the new column (immediately after `new_end_time TEXT,`):

```typescript
    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      exception_type TEXT NOT NULL,
      date TEXT NOT NULL,
      reason TEXT,
      new_date TEXT,
      new_start_time TEXT,
      new_end_time TEXT,
      class_schedule_slot_id TEXT REFERENCES class_schedule_slots(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
```

In `server/src/repositories/scheduleExceptionRepository.ts`, replace the entire file with:

```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ScheduleException, ScheduleExceptionInput } from '@theall/shared';

interface ExceptionRow {
  id: string;
  student_id: string;
  target_type: string;
  target_id: string;
  exception_type: string;
  date: string;
  reason: string | null;
  new_date: string | null;
  new_start_time: string | null;
  new_end_time: string | null;
  class_schedule_slot_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToException(row: ExceptionRow): ScheduleException {
  return {
    id: row.id,
    studentId: row.student_id,
    targetType: row.target_type as ScheduleException['targetType'],
    targetId: row.target_id,
    exceptionType: row.exception_type as ScheduleException['exceptionType'],
    date: row.date,
    reason: row.reason ?? undefined,
    newDate: row.new_date ?? undefined,
    newStartTime: row.new_start_time ?? undefined,
    newEndTime: row.new_end_time ?? undefined,
    classScheduleSlotId: row.class_schedule_slot_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ScheduleExceptionRepository {
  constructor(private db: Database.Database) {}

  create(input: ScheduleExceptionInput): ScheduleException {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO schedule_exceptions
         (id, student_id, target_type, target_id, exception_type, date, reason, new_date, new_start_time, new_end_time, class_schedule_slot_id, created_at, updated_at)
         VALUES (@id, @studentId, @targetType, @targetId, @exceptionType, @date, @reason, @newDate, @newStartTime, @newEndTime, @classScheduleSlotId, @createdAt, @updatedAt)`
      )
      .run({
        id,
        studentId: input.studentId,
        targetType: input.targetType,
        targetId: input.targetId,
        exceptionType: input.exceptionType,
        date: input.date,
        reason: input.reason ?? null,
        newDate: input.newDate ?? null,
        newStartTime: input.newStartTime ?? null,
        newEndTime: input.newEndTime ?? null,
        classScheduleSlotId: input.classScheduleSlotId ?? null,
        createdAt: now,
        updatedAt: now
      });
    return this.getById(id)!;
  }

  update(id: string, input: ScheduleExceptionInput): ScheduleException | undefined {
    if (!this.getById(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE schedule_exceptions SET student_id = @studentId, target_type = @targetType, target_id = @targetId,
         exception_type = @exceptionType, date = @date, reason = @reason, new_date = @newDate,
         new_start_time = @newStartTime, new_end_time = @newEndTime, class_schedule_slot_id = @classScheduleSlotId,
         updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id,
        studentId: input.studentId,
        targetType: input.targetType,
        targetId: input.targetId,
        exceptionType: input.exceptionType,
        date: input.date,
        reason: input.reason ?? null,
        newDate: input.newDate ?? null,
        newStartTime: input.newStartTime ?? null,
        newEndTime: input.newEndTime ?? null,
        classScheduleSlotId: input.classScheduleSlotId ?? null,
        updatedAt: now
      });
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM schedule_exceptions WHERE id = ?').run(id).changes > 0;
  }

  getById(id: string): ScheduleException | undefined {
    const row = this.db.prepare('SELECT * FROM schedule_exceptions WHERE id = ?').get(id) as
      | ExceptionRow
      | undefined;
    return row ? rowToException(row) : undefined;
  }

  list(): ScheduleException[] {
    const rows = this.db
      .prepare('SELECT * FROM schedule_exceptions ORDER BY date, created_at')
      .all() as ExceptionRow[];
    return rows.map(rowToException);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- scheduleExceptionRepository`
Expected: PASS (all tests in `server/test/scheduleExceptionRepository.test.ts`, including the two new ones).

- [ ] **Step 5: Run the full server test suite and typecheck**

Run: `npm test --workspace=server && npm run typecheck --workspace=server`
Expected: PASS — this touches `db.ts`, which every other server test's `createDb(':memory:')` call depends on, so run the full suite here, not just the repository file.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/repositories/scheduleExceptionRepository.ts server/test/scheduleExceptionRepository.test.ts
git commit -m "feat(server): add class_schedule_slot_id column and repository support

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

### Task 3: Route validation — slot must belong to the target class

**Files:**
- Modify: `server/src/routes/exceptions.ts`
- Test: `server/test/exceptionsRoute.test.ts`

**Interfaces:**
- Consumes: `ClassRepository.getById(targetId): Class | undefined` (existing, from `server/src/repositories/classRepository.ts`) and its `Class['schedule']: ScheduleSlot[]` where each `ScheduleSlot` has `id: string` (existing, from `shared/src/schemas.ts`). `ScheduleExceptionInput['classScheduleSlotId']` from Task 1.
- Produces: nothing new consumed by later tasks — this task is a validation-only addition to an existing route.

- [ ] **Step 1: Write the failing test**

Add to `server/test/exceptionsRoute.test.ts`, inside the `describe('/exceptions', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('accepts an exception with a classScheduleSlotId that belongs to the target class', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const classRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [
          { dayOfWeek: 2, startTime: '16:00', endTime: '17:30' },
          { dayOfWeek: 2, startTime: '18:00', endTime: '19:30' }
        ]
      });
    const classId = classRes.body.data.id;
    const slotId = classRes.body.data.schedule[0].id;

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: classId,
        classScheduleSlotId: slotId,
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.classScheduleSlotId).toBe(slotId);
  });

  it('rejects an exception whose classScheduleSlotId does not belong to the target class', async () => {
    const { app } = buildApp();
    const classId = await createClass(app);

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: classId,
        classScheduleSlotId: 'does-not-exist',
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(400);
  });

  it('rejects a classScheduleSlotId on a clinic-targeted exception', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const clinicRes = await request(app)
      .post('/clinics')
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 2, startTime: '18:00', endTime: '19:00' });

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'clinic',
        targetId: clinicRes.body.data.id,
        classScheduleSlotId: 'some-slot',
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- exceptionsRoute`
Expected: FAIL on the second and third new tests (both currently return 201, since there is no slot-ownership validation yet). The first new test passes already (Task 2 made `classScheduleSlotId` round-trip), which is fine — it documents the accept path and guards against a future regression.

- [ ] **Step 3: Write minimal implementation**

In `server/src/routes/exceptions.ts`, add a `slotBelongsToClass` helper next to the existing `targetExists` helper, and call it in both `POST /` and `PATCH /:id` right after the existing `targetExists` check. Replace the whole file with:

```typescript
import { Router } from 'express';
import { scheduleExceptionInputSchema, type ApiResponse, type ScheduleException } from '@theall/shared';
import type { ScheduleExceptionRepository } from '../repositories/scheduleExceptionRepository.js';
import type { ClassRepository } from '../repositories/classRepository.js';
import type { ClinicRepository } from '../repositories/clinicRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createExceptionsRouter(
  repo: ScheduleExceptionRepository,
  classRepo: ClassRepository,
  clinicRepo: ClinicRepository,
  broadcast: Broadcaster
): Router {
  const router = Router();

  function targetExists(targetType: string, targetId: string): boolean {
    return targetType === 'class' ? Boolean(classRepo.getById(targetId)) : Boolean(clinicRepo.getById(targetId));
  }

  // A classScheduleSlotId only makes sense for a class target, and only when
  // it actually names one of that class's schedule slots. No slot id at all
  // is always valid — it means "match every slot of this class."
  function slotBelongsToClass(targetType: string, targetId: string, classScheduleSlotId: string | undefined): boolean {
    if (!classScheduleSlotId) return true;
    if (targetType !== 'class') return false;
    const klass = classRepo.getById(targetId);
    return Boolean(klass?.schedule.some((slot) => slot.id === classScheduleSlotId));
  }

  router.get('/', (_req, res) => {
    const response: ApiResponse<ScheduleException[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = scheduleExceptionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    if (!targetExists(parsed.data.targetType, parsed.data.targetId)) {
      const response: ApiResponse<never> = { success: false, error: 'target not found' };
      res.status(400).json(response);
      return;
    }
    if (!slotBelongsToClass(parsed.data.targetType, parsed.data.targetId, parsed.data.classScheduleSlotId)) {
      const response: ApiResponse<never> = { success: false, error: 'classScheduleSlotId does not belong to the target class' };
      res.status(400).json(response);
      return;
    }
    const exception = repo.create(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<ScheduleException> = { success: true, data: exception };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = scheduleExceptionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    if (!targetExists(parsed.data.targetType, parsed.data.targetId)) {
      const response: ApiResponse<never> = { success: false, error: 'target not found' };
      res.status(400).json(response);
      return;
    }
    if (!slotBelongsToClass(parsed.data.targetType, parsed.data.targetId, parsed.data.classScheduleSlotId)) {
      const response: ApiResponse<never> = { success: false, error: 'classScheduleSlotId does not belong to the target class' };
      res.status(400).json(response);
      return;
    }
    const exception = repo.update(req.params.id, parsed.data);
    if (!exception) {
      const response: ApiResponse<never> = { success: false, error: 'exception not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('attendance');
    const response: ApiResponse<ScheduleException> = { success: true, data: exception };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'exception not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('attendance');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- exceptionsRoute`
Expected: PASS (all tests in `server/test/exceptionsRoute.test.ts`, including the three new ones).

- [ ] **Step 5: Run the full server test suite and typecheck**

Run: `npm test --workspace=server && npm run typecheck --workspace=server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/exceptions.ts server/test/exceptionsRoute.test.ts
git commit -m "feat(server): validate classScheduleSlotId belongs to the target class

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

### Task 4: `roster.ts` — slot-aware matching (the bug fix)

**Files:**
- Modify: `server/src/services/roster.ts`
- Test: `server/test/roster.test.ts`

**Interfaces:**
- Consumes: `class_schedule_slots.id` (existing column), `schedule_exceptions.class_schedule_slot_id` (Task 2).
- Produces: `computeRoster(db, date): RosterEntry[]` — signature unchanged; no other task depends on internals changed here.

- [ ] **Step 1: Write the failing test**

Add to `server/test/roster.test.ts`, inside the `describe('computeRoster', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('only removes the targeted slot when a class has two same-weekday slots and the exception targets one specific slot', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    const targetedSlotId = klass.schedule[0].id;
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, class_schedule_slot_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, targetedSlotId, MONDAY);

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '18:00', endTime: '19:30' })
    ]);
  });

  it('removes every same-weekday slot of the class when the exception has no class_schedule_slot_id', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);

    expect(computeRoster(db, MONDAY)).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- roster`
Expected: FAIL on the first new test — with today's `roster.ts`, the exception matches on `(student_id, target_type, target_id)` alone, so it removes both slots (16:00 and 18:00), leaving an empty roster instead of the 18:00 entry. The second new test passes already (documents existing, already-correct whole-class behavior).

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `server/src/services/roster.ts` with:

```typescript
import type Database from 'better-sqlite3';
import type { RosterEntry } from '@theall/shared';

interface ClassSlotRow {
  class_id: string;
  class_name: string;
  slot_id: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ClinicSlotRow {
  clinic_id: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ExceptionOutRow {
  student_id: string;
  target_type: string;
  target_id: string;
  class_schedule_slot_id: string | null;
}

interface ExceptionInRow {
  student_id: string;
  target_type: 'class' | 'clinic';
  target_id: string;
  new_start_time: string;
  new_end_time: string;
  student_name: string;
  label: string;
}

interface AttendanceRow {
  student_id: string;
  check_in_time: string;
}

// A roster candidate carries the class_schedule_slots.id it came from
// (class rows only — a clinic assignment has no separate slot concept, the
// clinic_assignments row IS the slot). slotId is used only to match a
// schedule exception to the exact occurrence it targets; it is stripped
// before the entry is returned, since RosterEntry has no slot-id field.
interface RosterCandidate extends RosterEntry {
  slotId?: string;
}

// Dates are interpreted in the server's local timezone. This is a
// single-LAN internal tool where the server and its users share one
// locale, so that's an acceptable simplification.
export function computeRoster(db: Database.Database, date: string): RosterEntry[] {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const classRows = db
    .prepare(
      `SELECT c.id as class_id, c.name as class_name, s.id as slot_id, s.start_time, s.end_time,
              e.student_id, st.name as student_name
       FROM class_schedule_slots s
       JOIN classes c ON c.id = s.class_id
       JOIN class_enrollments e ON e.class_id = c.id
       JOIN students st ON st.id = e.student_id
       WHERE s.day_of_week = ?`
    )
    .all(dayOfWeek) as ClassSlotRow[];

  const clinicRows = db
    .prepare(
      `SELECT ca.id as clinic_id, ca.start_time, ca.end_time, ca.student_id, st.name as student_name
       FROM clinic_assignments ca
       JOIN students st ON st.id = ca.student_id
       WHERE ca.day_of_week = ?`
    )
    .all(dayOfWeek) as ClinicSlotRow[];

  let entries: RosterCandidate[] = [
    ...classRows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
      slotId: row.slot_id,
      label: row.class_name,
      startTime: row.start_time,
      endTime: row.end_time,
      checkedIn: false
    })),
    ...clinicRows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'clinic' as const,
      sourceId: row.clinic_id,
      label: '클리닉',
      startTime: row.start_time,
      endTime: row.end_time,
      checkedIn: false
    }))
  ];

  const removals = db
    .prepare(
      `SELECT student_id, target_type, target_id, class_schedule_slot_id FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  // An exception with no class_schedule_slot_id matches every slot of the
  // target class (the original, pre-slot-targeting behavior — kept as the
  // default for clinics and for exceptions that don't target a specific
  // slot). An exception with a class_schedule_slot_id matches only that one
  // slot — this is what fixes classes with two or more same-weekday slots
  // losing every occurrence to a single exception.
  entries = entries.filter(
    (entry) =>
      !removals.some(
        (ex) =>
          ex.student_id === entry.studentId &&
          ex.target_type === entry.source &&
          ex.target_id === entry.sourceId &&
          (ex.class_schedule_slot_id === null || ex.class_schedule_slot_id === entry.slotId)
      )
  );

  const additions = db
    .prepare(
      `SELECT se.student_id, se.target_type, se.target_id, se.new_start_time, se.new_end_time,
              st.name as student_name,
              CASE se.target_type WHEN 'class' THEN COALESCE(c.name, '(삭제된 수업)') ELSE '클리닉' END as label
       FROM schedule_exceptions se
       JOIN students st ON st.id = se.student_id
       LEFT JOIN classes c ON se.target_type = 'class' AND c.id = se.target_id
       WHERE COALESCE(se.new_date, se.date) = ? AND se.exception_type IN ('reschedule', 'makeup')`
    )
    .all(date) as ExceptionInRow[];

  for (const row of additions) {
    entries.push({
      studentId: row.student_id,
      studentName: row.student_name,
      source: row.target_type,
      sourceId: row.target_id,
      label: row.label,
      startTime: row.new_start_time,
      endTime: row.new_end_time,
      checkedIn: false
    });
  }

  const attendance = db
    .prepare('SELECT student_id, check_in_time FROM attendance_logs WHERE date = ?')
    .all(date) as AttendanceRow[];
  const checkInByStudent = new Map(attendance.map((row) => [row.student_id, row.check_in_time]));

  entries = entries.map((entry) => {
    const checkInTime = checkInByStudent.get(entry.studentId);
    return checkInTime ? { ...entry, checkedIn: true, checkInTime } : entry;
  });

  return entries
    .map(({ slotId, ...publicEntry }) => publicEntry)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.studentName.localeCompare(b.studentName));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- roster`
Expected: PASS (all tests in `server/test/roster.test.ts`, including the two new ones).

- [ ] **Step 5: Run the full server test suite and typecheck**

Run: `npm test --workspace=server && npm run typecheck --workspace=server`
Expected: PASS. Also confirm `server/src/routes/attendance.ts` (the only caller of `computeRoster`) needs no changes — its existing test suite passing is sufficient proof, since `computeRoster`'s signature and return type are unchanged.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/roster.ts server/test/roster.test.ts
git commit -m "fix(server): make computeRoster slot-aware to stop losing same-weekday occurrences

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

### Task 5: `calendar.ts` — mirror the same slot-aware fix

**Files:**
- Modify: `server/src/services/calendar.ts`
- Test: `server/test/calendar.test.ts`

**Interfaces:**
- Consumes: `class_schedule_slots.id`, `schedule_exceptions.class_schedule_slot_id` (Task 2) — identical inputs to Task 4.
- Produces: `computeCalendarEvents(db, from, to): CalendarEvent[]` — signature unchanged; no other task depends on internals changed here.

- [ ] **Step 1: Write the failing test**

Add to `server/test/calendar.test.ts`, inside the `describe('computeCalendarEvents', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('only marks the targeted slot as absence when a class has two same-weekday slots and the exception targets one specific slot', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    const targetedSlotId = klass.schedule[0].id;
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, class_schedule_slot_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, targetedSlotId, MONDAY);

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ startTime: '16:00', endTime: '17:30', category: 'absence' }),
      expect.objectContaining({ startTime: '18:00', endTime: '19:30', category: 'regular_class' })
    ]);
  });

  it('marks every same-weekday slot as absence when the exception has no class_schedule_slot_id', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ startTime: '16:00', category: 'absence' }),
      expect.objectContaining({ startTime: '18:00', category: 'absence' })
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- calendar`
Expected: FAIL on the first new test — with today's `calendar.ts`, the exception matches both slots on `(student_id, target_type, target_id)` alone, so both come back `category: 'absence'` instead of only the 16:00 one. The second new test passes already (documents existing, already-correct whole-class behavior).

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `server/src/services/calendar.ts` with:

```typescript
import type Database from 'better-sqlite3';
import type { CalendarEvent } from '@theall/shared';

interface ClassSlotRow {
  class_id: string;
  class_name: string;
  slot_id: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ClinicSlotRow {
  clinic_id: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ExceptionOutRow {
  student_id: string;
  target_type: string;
  target_id: string;
  exception_type: 'absence' | 'reschedule';
  class_schedule_slot_id: string | null;
}

interface ExceptionInRow {
  student_id: string;
  target_type: 'class' | 'clinic';
  target_id: string;
  exception_type: 'reschedule' | 'makeup';
  new_start_time: string;
  new_end_time: string;
  student_name: string;
  label: string;
}

// A calendar candidate carries the class_schedule_slots.id it came from
// (class rows only — a clinic assignment has no separate slot concept, the
// clinic_assignments row IS the slot). slotId is used only to match a
// schedule exception to the exact occurrence it targets; it is stripped
// before the event is returned, since CalendarEvent has no slot-id field.
interface CalendarCandidate extends CalendarEvent {
  slotId?: string;
}

// Dates are interpreted in the server's local timezone, matching
// computeRoster's simplification for this single-LAN, single-locale tool.
function computeEventsForDate(db: Database.Database, date: string): CalendarEvent[] {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const classRows = db
    .prepare(
      `SELECT c.id as class_id, c.name as class_name, s.id as slot_id, s.start_time, s.end_time,
              e.student_id, st.name as student_name
       FROM class_schedule_slots s
       JOIN classes c ON c.id = s.class_id
       JOIN class_enrollments e ON e.class_id = c.id
       JOIN students st ON st.id = e.student_id
       WHERE s.day_of_week = ?`
    )
    .all(dayOfWeek) as ClassSlotRow[];

  const clinicRows = db
    .prepare(
      `SELECT ca.id as clinic_id, ca.start_time, ca.end_time, ca.student_id, st.name as student_name
       FROM clinic_assignments ca
       JOIN students st ON st.id = ca.student_id
       WHERE ca.day_of_week = ?`
    )
    .all(dayOfWeek) as ClinicSlotRow[];

  let events: CalendarCandidate[] = [
    ...classRows.map((row) => ({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
      slotId: row.slot_id,
      category: 'regular_class' as const,
      label: row.class_name,
      startTime: row.start_time,
      endTime: row.end_time
    })),
    ...clinicRows.map((row) => ({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'clinic' as const,
      sourceId: row.clinic_id,
      category: 'clinic' as const,
      label: '클리닉',
      startTime: row.start_time,
      endTime: row.end_time
    }))
  ];

  const exceptionsForDate = db
    .prepare(
      `SELECT student_id, target_type, target_id, exception_type, class_schedule_slot_id FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  events = events.reduce<CalendarCandidate[]>((acc, event) => {
    // An exception with no class_schedule_slot_id matches every slot of the
    // target class (the original, pre-slot-targeting behavior). One with a
    // class_schedule_slot_id matches only that one slot — this is what
    // fixes classes with two or more same-weekday slots losing every
    // occurrence to a single exception.
    const matches = exceptionsForDate.filter(
      (ex) =>
        ex.student_id === event.studentId &&
        ex.target_type === event.source &&
        ex.target_id === event.sourceId &&
        (ex.class_schedule_slot_id === null || ex.class_schedule_slot_id === event.slotId)
    );
    const match = matches.find((ex) => ex.exception_type === 'reschedule') ?? matches[0];
    if (!match) {
      acc.push(event);
    } else if (match.exception_type === 'absence') {
      acc.push({ ...event, category: 'absence' });
    }
    // exception_type === 'reschedule': the occurrence moved to another date — drop it here,
    // it is re-added below on its new date. (If both an absence and a
    // reschedule exist for the same occurrence, reschedule wins deterministically —
    // see above.)
    return acc;
  }, []);

  const additions = db
    .prepare(
      `SELECT se.student_id, se.target_type, se.target_id, se.exception_type, se.new_start_time, se.new_end_time,
              st.name as student_name,
              CASE se.target_type WHEN 'class' THEN COALESCE(c.name, '(삭제된 수업)') ELSE '클리닉' END as label
       FROM schedule_exceptions se
       JOIN students st ON st.id = se.student_id
       LEFT JOIN classes c ON se.target_type = 'class' AND c.id = se.target_id
       WHERE COALESCE(se.new_date, se.date) = ? AND se.exception_type IN ('reschedule', 'makeup')`
    )
    .all(date) as ExceptionInRow[];

  for (const row of additions) {
    events.push({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: row.target_type,
      sourceId: row.target_id,
      category: row.exception_type,
      label: row.label,
      startTime: row.new_start_time,
      endTime: row.new_end_time
    });
  }

  return events.map(({ slotId, ...publicEvent }) => publicEvent);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

export function computeCalendarEvents(db: Database.Database, from: string, to: string): CalendarEvent[] {
  const events = enumerateDates(from, to).flatMap((date) => computeEventsForDate(db, date));
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.studentName.localeCompare(b.studentName)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- calendar`
Expected: PASS (all tests in `server/test/calendar.test.ts`, including the two new ones). Note `server/test/calendarRoute.test.ts` also runs under the `calendar` filter — confirm it still passes too, since it exercises `computeCalendarEvents` through the HTTP route.

- [ ] **Step 5: Run the full server test suite and typecheck**

Run: `npm test --workspace=server && npm run typecheck --workspace=server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/calendar.ts server/test/calendar.test.ts
git commit -m "fix(server): make computeCalendarEvents slot-aware to stop losing same-weekday occurrences

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

### Task 6: Desktop — slot picker in `ExceptionsPage`

**Files:**
- Modify: `desktop/src/pages/ExceptionsPage.tsx`
- Test: `desktop/test/ExceptionsPage.test.tsx`

**Interfaces:**
- Consumes: `ScheduleExceptionInput['classScheduleSlotId']` (Task 1), `Class['schedule']: ScheduleSlot[]` (existing, each with `id`, `dayOfWeek`, `startTime`, `endTime`), `formatDayOfWeek(dayOfWeek: number): string` (existing, `desktop/src/dayOfWeek.ts`).
- Produces: nothing new consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Write the failing test**

Add to `desktop/test/ExceptionsPage.test.tsx`, inside the `describe('ExceptionsPage', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('shows a slot picker only for a class with more than one schedule slot, and includes the chosen slot id on submit', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [
          { id: 'slot1', dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
          { id: 'slot2', dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
        ],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'c2',
        name: '중3 영어',
        teacherName: '이선생',
        schedule: [{ id: 'slot3', dayOfWeek: 2, startTime: '17:00', endTime: '18:00' }],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.create).mockResolvedValue({
      id: 'e1',
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      classScheduleSlotId: 'slot1',
      exceptionType: 'absence',
      date: '2026-09-15',
      createdAt: '',
      updatedAt: ''
    });

    render(<ExceptionsPage />);
    await screen.findByText('중2 수학');

    await userEvent.selectOptions(screen.getByDisplayValue('학생 선택'), 's1');

    // Single-slot class: no slot picker.
    await userEvent.selectOptions(screen.getByDisplayValue('대상 선택'), 'c2');
    expect(screen.queryByText('전체 시간대')).not.toBeInTheDocument();

    // Multi-slot class: slot picker appears.
    await userEvent.selectOptions(screen.getByDisplayValue('대상 선택'), 'c1');
    const slotSelect = screen.getByDisplayValue('전체 시간대');
    await userEvent.selectOptions(slotSelect, 'slot1');

    const dateInput = screen.getAllByDisplayValue('').find((el) => el.getAttribute('type') === 'date');
    fireEvent.change(dateInput!, { target: { value: '2026-09-15' } });

    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(exceptionsApi.create).toHaveBeenCalled());
    const [input] = vi.mocked(exceptionsApi.create).mock.calls[0];
    expect(input).toMatchObject({ targetId: 'c1', classScheduleSlotId: 'slot1' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=desktop -- ExceptionsPage`
Expected: FAIL — `screen.getByDisplayValue('전체 시간대')` throws because no such element exists yet.

- [ ] **Step 3: Write minimal implementation**

In `desktop/src/pages/ExceptionsPage.tsx`:

Add the import (alongside the existing imports, after the `logger` import):

```typescript
import { formatDayOfWeek } from '../dayOfWeek';
```

Replace this block:

```typescript
  const targetOptions: Array<Class | ClinicAssignment> = form.targetType === 'class' ? classes : clinics;
  const needsNewTime = form.exceptionType === 'reschedule' || form.exceptionType === 'makeup';
```

with:

```typescript
  const targetOptions: Array<Class | ClinicAssignment> = form.targetType === 'class' ? classes : clinics;
  const needsNewTime = form.exceptionType === 'reschedule' || form.exceptionType === 'makeup';
  const selectedClass = form.targetType === 'class' ? classes.find((c) => c.id === form.targetId) : undefined;
  const showSlotPicker = Boolean(selectedClass && selectedClass.schedule.length > 1);
```

Modify the `targetType` `<select>`'s `onChange` to also clear `classScheduleSlotId` (it currently clears `targetId`); replace:

```tsx
        <select
          value={form.targetType}
          onChange={(e) =>
            setForm({ ...form, targetType: e.target.value as ScheduleExceptionInput['targetType'], targetId: '' })
          }
        >
          <option value="class">수업</option>
          <option value="clinic">클리닉</option>
        </select>
```

with:

```tsx
        <select
          value={form.targetType}
          onChange={(e) =>
            setForm({
              ...form,
              targetType: e.target.value as ScheduleExceptionInput['targetType'],
              targetId: '',
              classScheduleSlotId: undefined
            })
          }
        >
          <option value="class">수업</option>
          <option value="clinic">클리닉</option>
        </select>
```

Modify the target `<select>`'s `onChange` to also clear `classScheduleSlotId`, and add the new slot `<select>` immediately after it; replace:

```tsx
        <select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} required>
          <option value="">대상 선택</option>
          {targetOptions.map((target) => (
            <option key={target.id} value={target.id}>
              {form.targetType === 'class'
                ? (target as Class).name
                : `클리닉(${studentName((target as ClinicAssignment).studentId)})`}
            </option>
          ))}
        </select>
```

with:

```tsx
        <select
          value={form.targetId}
          onChange={(e) => setForm({ ...form, targetId: e.target.value, classScheduleSlotId: undefined })}
          required
        >
          <option value="">대상 선택</option>
          {targetOptions.map((target) => (
            <option key={target.id} value={target.id}>
              {form.targetType === 'class'
                ? (target as Class).name
                : `클리닉(${studentName((target as ClinicAssignment).studentId)})`}
            </option>
          ))}
        </select>
        {showSlotPicker && (
          <select
            value={form.classScheduleSlotId ?? ''}
            onChange={(e) => setForm({ ...form, classScheduleSlotId: e.target.value || undefined })}
          >
            <option value="">전체 시간대</option>
            {selectedClass!.schedule.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {formatDayOfWeek(slot.dayOfWeek)} {slot.startTime}-{slot.endTime}
              </option>
            ))}
          </select>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=desktop -- ExceptionsPage`
Expected: PASS (all tests in `desktop/test/ExceptionsPage.test.tsx`, including the new one).

- [ ] **Step 5: Run the full desktop test suite and typecheck**

Run: `npm test --workspace=desktop && npm run typecheck --workspace=desktop`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/pages/ExceptionsPage.tsx desktop/test/ExceptionsPage.test.tsx
git commit -m "feat(desktop): add slot picker to ExceptionsPage for multi-slot classes

Claude-Session: https://claude.ai/code/session_014o81agfu1LAKt4PcLEFD8L"
```

---

## Final Verification

After all 6 tasks are complete, run the full workspace suite from the repo root:

```bash
npm test && npm run typecheck --workspaces
```

Expected: all three workspaces (`shared`, `server`, `desktop`) pass, with no regressions against the pre-plan baseline (shared 21→22, server 98→107, desktop 53→54 — exact counts depend on how many `it()` blocks were added per task above; the important invariant is zero failures and zero skips).
