# 캘린더 & 엑셀/PDF 내보내기 (Calendar & Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 4's backend: a date-range calendar events API and Excel/PDF export endpoints, on top of the completed student/class/clinic master data (sub-project 1) and attendance/exceptions (sub-project 2). Desktop UI (calendar grid, filters, export buttons) is explicitly out of scope — a separate UI effort consumes these APIs.

**Architecture:** Extends the existing `shared`/`server` monorepo packages — no `desktop` changes in this plan. A new read-model service `computeCalendarEvents(db, from, to)` (parallel to sub-project 2's `computeRoster`, but for a date range and without removing absent/moved occurrences — it recolors them instead) feeds both a `GET /calendar` JSON endpoint and two file-generating endpoints (`GET /export/excel`, `GET /export/pdf`) that reuse the same computed events.

**Tech Stack:** Same as prior sub-projects — TypeScript, Express, better-sqlite3, Zod, Vitest + Supertest. New: `exceljs` (Excel generation), `pdfkit` (PDF generation), `@reogrid/font-kr` (Korean TrueType font bytes for PDF text — pdfkit's default fonts have no Hangul glyphs). All three are pure JavaScript/data packages with no native build step, chosen specifically because this project has repeatedly hit native-module build fragility with `better-sqlite3`.

**Spec:** `docs/superpowers/specs/2026-09-14-calendar-export-design.md`

## Global Constraints

- Same conventions as prior sub-projects: TypeScript everywhere, no `any`; `ApiResponse<T>` envelope on every JSON route; Repository/service pattern (no SQL outside `repositories/` and `services/`); `logger` instead of raw `console.*`.
- Dates are plain `YYYY-MM-DD` strings; times are `HH:MM` strings. The shared `dateStringSchema` in `shared/src/schemas.ts` is module-private (not exported) — this plan's route-level date validation duplicates the same regex inline, exactly matching the existing convention in `server/src/routes/attendance.ts`'s `/roster` endpoint. This is pre-existing, acknowledged technical debt, not something this plan introduces or needs to fix.
- **`CalendarEvent` includes `source`/`sourceId` fields** (mirroring `RosterEntry`'s naming from sub-project 2) even though the original design spec's field table didn't list them — they're needed internally to correctly match a `schedule_exceptions` row to the specific class/clinic occurrence it affects (a student enrolled in two classes on the same day must not have an exception meant for one class accidentally match the other). This is a refinement made during planning, not a scope change — the spec's UI-facing description of what a calendar event *shows* is unaffected.
- **Category semantics** (this plan's domain rule, restated from the spec precisely): a `regular_class`/`clinic` occurrence whose date has a matching `absence` exception keeps its `studentId`/`label`/`startTime`/`endTime` but changes `category` to `'absence'` — it is never removed from the output. A `reschedule` exception removes the occurrence from its original date entirely (no `'absence'` marker there) and adds a `category: 'reschedule'` entry on `COALESCE(new_date, date)` with the exception's `new_start_time`/`new_end_time`. A `makeup` exception never affects the original recurring schedule and only adds a `category: 'makeup'` entry on `COALESCE(new_date, date)` — this `COALESCE` pattern (not `new_date` alone) is required because `makeup` exceptions never set `new_date` (confirmed and fixed in sub-project 2's final review after a real bug); reuse `server/src/services/roster.ts`'s exact SQL shape for both the removal and addition queries rather than inventing new SQL.
- Date-range endpoints (`/calendar`, `/export/excel`, `/export/pdf`) all reject a range exceeding 90 days, and reject `from > to`, via one shared `parseDateRange` helper — no endpoint duplicates this validation logic.
- No changes to `desktop/` in this plan. No changes to the `Electron` security baseline (not applicable — this plan doesn't touch `desktop/`).

---

## Task 1: Shared schema for CalendarEvent

**Files:**
- Modify: `shared/src/schemas.ts` (append after the existing `handoverNoteSchema`/`rosterEntrySchema` block, before the `ApiResponse<T>` interface at the end of the file)
- Modify: `shared/test/schemas.test.ts` (append a new `describe` block at the end of the file, and add `calendarEventSchema` to the existing import list at the top)

**Interfaces:**
- Produces: `calendarEventCategorySchema`, `CalendarEventCategory`, `calendarEventSchema`, `CalendarEvent`. Every later task imports these from `@theall/shared`.

- [ ] **Step 1: Write the failing schema tests**

Add `calendarEventSchema` to the existing `import { ... } from '../src/schemas.js';` block at the top of `shared/test/schemas.test.ts`.

Then append this block to the end of `shared/test/schemas.test.ts`:

```typescript
describe('calendarEventSchema', () => {
  it('accepts a valid regular_class event', () => {
    const result = calendarEventSchema.safeParse({
      date: '2026-09-15',
      studentId: 's1',
      studentName: '김민준',
      source: 'class',
      sourceId: 'c1',
      category: 'regular_class',
      label: '중2 수학',
      startTime: '16:00',
      endTime: '17:30'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid category', () => {
    const result = calendarEventSchema.safeParse({
      date: '2026-09-15',
      studentId: 's1',
      studentName: '김민준',
      source: 'class',
      sourceId: 'c1',
      category: 'not-a-real-category',
      label: '중2 수학',
      startTime: '16:00',
      endTime: '17:30'
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=shared`
Expected: FAIL — `calendarEventSchema` does not exist yet.

- [ ] **Step 3: Implement the schema**

Append this block to `shared/src/schemas.ts` (after `handoverNoteSchema`/`HandoverNote`, before `rosterEntrySchema` — exact position relative to `rosterEntrySchema` doesn't matter):

```typescript
export const calendarEventCategorySchema = z.enum([
  'regular_class',
  'clinic',
  'absence',
  'reschedule',
  'makeup'
]);
export type CalendarEventCategory = z.infer<typeof calendarEventCategorySchema>;

export const calendarEventSchema = z.object({
  date: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  source: scheduleExceptionTargetTypeSchema,
  sourceId: z.string(),
  category: calendarEventCategorySchema,
  label: z.string(),
  startTime: z.string(),
  endTime: z.string()
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
```

`scheduleExceptionTargetTypeSchema` is already defined earlier in this same file (from sub-project 2) — reuse it, do not redefine `'class' | 'clinic'` again.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=shared`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas.ts shared/test/schemas.test.ts
git commit -m "feat: add CalendarEvent schema"
```

---

## Task 2: Date-range validation + computeCalendarEvents service

**Files:**
- Create: `server/src/services/dateRange.ts`
- Create: `server/src/services/calendar.ts`
- Test: `server/test/dateRange.test.ts`
- Test: `server/test/calendar.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` (Task 1).
- Produces: `parseDateRange(from: unknown, to: unknown): ParsedDateRange` where `ParsedDateRange = { ok: true; from: string; to: string } | { ok: false; error: string }`. `computeCalendarEvents(db: Database.Database, from: string, to: string): CalendarEvent[]`. Tasks 3-5 import both.

- [ ] **Step 1: Write the failing date-range tests**

`server/test/dateRange.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { parseDateRange } from '../src/services/dateRange.js';

describe('parseDateRange', () => {
  it('accepts a valid range', () => {
    const result = parseDateRange('2026-09-01', '2026-09-07');
    expect(result).toEqual({ ok: true, from: '2026-09-01', to: '2026-09-07' });
  });

  it('rejects a missing from', () => {
    const result = parseDateRange(undefined, '2026-09-07');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = parseDateRange('2026/09/01', '2026-09-07');
    expect(result.ok).toBe(false);
  });

  it('rejects from after to', () => {
    const result = parseDateRange('2026-09-10', '2026-09-01');
    expect(result.ok).toBe(false);
  });

  it('rejects a range longer than 90 days', () => {
    const result = parseDateRange('2026-01-01', '2026-12-31');
    expect(result.ok).toBe(false);
  });

  it('accepts a range of exactly 90 days', () => {
    const result = parseDateRange('2026-01-01', '2026-04-01');
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `parseDateRange` does not exist yet.

- [ ] **Step 3: Implement date-range validation**

`server/src/services/dateRange.ts`:
```typescript
export interface ParsedDateRangeOk {
  ok: true;
  from: string;
  to: string;
}

export interface ParsedDateRangeError {
  ok: false;
  error: string;
}

export type ParsedDateRange = ParsedDateRangeOk | ParsedDateRangeError;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

export function parseDateRange(from: unknown, to: unknown): ParsedDateRange {
  if (typeof from !== 'string' || !DATE_PATTERN.test(from) || typeof to !== 'string' || !DATE_PATTERN.test(to)) {
    return { ok: false, error: 'from and to query params (YYYY-MM-DD) are required' };
  }
  if (from > to) {
    return { ok: false, error: 'from must not be after to' };
  }
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, error: `date range must not exceed ${MAX_RANGE_DAYS} days` };
  }
  return { ok: true, from, to };
}
```

(`from > to` and `from`/`to` being plain `YYYY-MM-DD` strings means lexicographic string comparison is equivalent to date comparison — no need to parse dates for that check.)

- [ ] **Step 4: Run date-range tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing calendar service tests**

`server/test/calendar.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';
import { computeCalendarEvents } from '../src/services/calendar.js';

// 2024-01-01 is a Monday (day 1).
const MONDAY = '2024-01-01';

describe('computeCalendarEvents', () => {
  let db: Database.Database;
  let students: StudentRepository;
  let classes: ClassRepository;
  let clinics: ClinicRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    students = new StudentRepository(db);
    classes = new ClassRepository(db);
    clinics = new ClinicRepository(db);
  });

  it('includes a regular class occurrence on its scheduled day', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'regular_class', source: 'class' })
    ]);
  });

  it('includes a clinic occurrence on its scheduled day', () => {
    const student = students.create({ name: '이지은' });
    clinics.create({ studentId: student.id, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'clinic', source: 'clinic' })
    ]);
  });

  it('marks an absent occurrence as category "absence" instead of removing it', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'absence' })
    ]);
  });

  it('removes a rescheduled occurrence from its original date and adds it on the new date', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const NEW_DATE = '2024-01-03';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'reschedule', ?, ?, '17:00', '18:30', '', '')`
    ).run(student.id, klass.id, MONDAY, NEW_DATE);

    const events = computeCalendarEvents(db, MONDAY, NEW_DATE);

    expect(events).toEqual([
      expect.objectContaining({
        date: NEW_DATE,
        studentId: student.id,
        category: 'reschedule',
        startTime: '17:00',
        endTime: '18:30'
      })
    ]);
  });

  it('adds a makeup occurrence on its date when new_date is unset, matching real API-created rows', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const MAKEUP_DATE = '2024-01-02';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'makeup', ?, '15:00', '16:00', '', '')`
    ).run(student.id, klass.id, MAKEUP_DATE);

    const events = computeCalendarEvents(db, MAKEUP_DATE, MAKEUP_DATE);

    expect(events).toEqual([
      expect.objectContaining({ date: MAKEUP_DATE, category: 'makeup', startTime: '15:00', endTime: '16:00' })
    ]);
  });

  it('aggregates events across a multi-day range in date order', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const NEXT_MONDAY = '2024-01-08';

    const events = computeCalendarEvents(db, MONDAY, NEXT_MONDAY);

    expect(events.map((e) => e.date)).toEqual([MONDAY, NEXT_MONDAY]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `computeCalendarEvents` does not exist yet.

- [ ] **Step 7: Implement the calendar service**

`server/src/services/calendar.ts`:
```typescript
import type Database from 'better-sqlite3';
import type { CalendarEvent } from '@theall/shared';

interface ClassSlotRow {
  class_id: string;
  class_name: string;
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
  exception_type: string;
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

// Dates are interpreted in the server's local timezone, matching
// computeRoster's simplification for this single-LAN, single-locale tool.
function computeEventsForDate(db: Database.Database, date: string): CalendarEvent[] {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const classRows = db
    .prepare(
      `SELECT c.id as class_id, c.name as class_name, s.start_time, s.end_time,
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

  let events: CalendarEvent[] = [
    ...classRows.map((row) => ({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
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
      `SELECT student_id, target_type, target_id, exception_type FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  events = events.reduce<CalendarEvent[]>((acc, event) => {
    const match = exceptionsForDate.find(
      (ex) => ex.student_id === event.studentId && ex.target_type === event.source && ex.target_id === event.sourceId
    );
    if (!match) {
      acc.push(event);
    } else if (match.exception_type === 'absence') {
      acc.push({ ...event, category: 'absence' });
    }
    // exception_type === 'reschedule': the occurrence moved to another date — drop it here,
    // it is re-added below on its new date.
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

  return events;
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

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 9: Commit**

```bash
git add server/src/services/dateRange.ts server/src/services/calendar.ts server/test/dateRange.test.ts server/test/calendar.test.ts
git commit -m "feat: add date-range validation and calendar events service"
```

---

## Task 3: GET /calendar route

**Files:**
- Create: `server/src/routes/calendar.ts`
- Modify: `server/src/app.ts` (replace the whole file — adds the `/calendar` mount)
- Test: `server/test/calendarRoute.test.ts`

**Interfaces:**
- Consumes: `parseDateRange`, `computeCalendarEvents` (Task 2), `CalendarEvent`/`ApiResponse` (Task 1 / existing).
- Produces: `createCalendarRouter(db: Database.Database): Router`.

- [ ] **Step 1: Write the failing route tests**

`server/test/calendarRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast) };
}

describe('GET /calendar', () => {
  it('returns computed events for the given range', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
        studentIds: [studentRes.body.data.id]
      });

    const res = await request(app).get('/calendar?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ studentId: studentRes.body.data.id, category: 'regular_class' })
    ]);
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/calendar');
    expect(res.status).toBe(400);
  });

  it('rejects a range longer than 90 days', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/calendar?from=2024-01-01&to=2024-12-31');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/calendar` does not exist yet.

- [ ] **Step 3: Implement the router and wire it into `createApp`**

`server/src/routes/calendar.ts`:
```typescript
import { Router } from 'express';
import type { ApiResponse, CalendarEvent } from '@theall/shared';
import type Database from 'better-sqlite3';
import { computeCalendarEvents } from '../services/calendar.js';
import { parseDateRange } from '../services/dateRange.js';

export function createCalendarRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range.ok) {
      const response: ApiResponse<never> = { success: false, error: range.error };
      res.status(400).json(response);
      return;
    }
    const events = computeCalendarEvents(db, range.from, range.to);
    const response: ApiResponse<CalendarEvent[]> = { success: true, data: events };
    res.json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — adds the `/calendar` mount):
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
import { createCalendarRouter } from './routes/calendar.js';
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
  app.use('/calendar', createCalendarRouter(db));

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/calendar.ts server/src/app.ts server/test/calendarRoute.test.ts
git commit -m "feat: add GET /calendar route"
```

---

## Task 4: Excel export

**Files:**
- Modify: `server/package.json` (add `exceljs` dependency)
- Create: `server/src/services/calendarCategoryLabels.ts`
- Create: `server/src/services/excelExport.ts`
- Create: `server/src/routes/excelExport.ts`
- Modify: `server/src/app.ts` (replace the whole file — adds the `/export/excel` mount)
- Test: `server/test/excelExport.test.ts`
- Test: `server/test/excelExportRoute.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent`/`CalendarEventCategory` (Task 1), `computeCalendarEvents`/`parseDateRange` (Task 2).
- Produces: `CATEGORY_LABELS: Record<CalendarEventCategory, string>`, `buildExcelBuffer(events: CalendarEvent[]): Promise<Buffer>`, `createExcelExportRouter(db: Database.Database): Router`. Task 5 imports `CATEGORY_LABELS`.

- [ ] **Step 1: Add the dependency**

In `server/package.json`, add to `"dependencies"`:
```json
"exceljs": "^4.4.0",
```
(Keep alphabetical order among the existing dependency keys — it sorts between `cors` and `express`.)

Run `npm install` from the repo root. If `npm install` fails on `better-sqlite3`'s prebuild fetch (unrelated to this change — known transient flakiness in this environment), retry once: `rm -rf node_modules package-lock.json && npm install`.

- [ ] **Step 2: Write the failing service test**

`server/test/excelExport.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelBuffer } from '../src/services/excelExport.js';
import type { CalendarEvent } from '@theall/shared';

describe('buildExcelBuffer', () => {
  it('writes one row per event with the Korean category label', async () => {
    const events: CalendarEvent[] = [
      {
        date: '2026-09-15',
        studentId: 's1',
        studentName: '김민준',
        source: 'class',
        sourceId: 'c1',
        category: 'regular_class',
        label: '중2 수학',
        startTime: '16:00',
        endTime: '17:30'
      }
    ];

    const buffer = await buildExcelBuffer(events);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('캘린더');
    expect(sheet?.rowCount).toBe(2); // header + 1 data row
    const row = sheet?.getRow(2).values as unknown[];
    expect(row).toContain('김민준');
    expect(row).toContain('정규수업');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `buildExcelBuffer` does not exist yet.

- [ ] **Step 4: Implement the category labels and Excel builder**

`server/src/services/calendarCategoryLabels.ts`:
```typescript
import type { CalendarEventCategory } from '@theall/shared';

export const CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  regular_class: '정규수업',
  clinic: '클리닉',
  absence: '결석',
  reschedule: '시간변경',
  makeup: '보충'
};
```

`server/src/services/excelExport.ts`:
```typescript
import ExcelJS from 'exceljs';
import type { CalendarEvent } from '@theall/shared';
import { CATEGORY_LABELS } from './calendarCategoryLabels.js';

export async function buildExcelBuffer(events: CalendarEvent[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('캘린더');
  sheet.columns = [
    { header: '날짜', key: 'date', width: 12 },
    { header: '학생명', key: 'studentName', width: 14 },
    { header: '분류', key: 'category', width: 12 },
    { header: '수업/클리닉', key: 'label', width: 16 },
    { header: '시작 시간', key: 'startTime', width: 10 },
    { header: '종료 시간', key: 'endTime', width: 10 }
  ];
  for (const event of events) {
    sheet.addRow({
      date: event.date,
      studentName: event.studentName,
      category: CATEGORY_LABELS[event.category],
      label: event.label,
      startTime: event.startTime,
      endTime: event.endTime
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 6: Write the failing route test**

`server/test/excelExportRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast) };
}

function bufferedGet(app: ReturnType<typeof createApp>, path: string) {
  return request(app)
    .get(path)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

describe('GET /export/excel', () => {
  it('returns an xlsx file containing one row per event', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
        studentIds: [studentRes.body.data.id]
      });

    const res = await bufferedGet(app, '/export/excel?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    const sheet = workbook.getWorksheet('캘린더');
    expect(sheet?.rowCount).toBe(2);
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/export/excel');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `/export/excel` does not exist yet.

- [ ] **Step 8: Implement the router and wire it into `createApp`**

`server/src/routes/excelExport.ts`:
```typescript
import { Router } from 'express';
import type { ApiResponse } from '@theall/shared';
import type Database from 'better-sqlite3';
import { computeCalendarEvents } from '../services/calendar.js';
import { parseDateRange } from '../services/dateRange.js';
import { buildExcelBuffer } from '../services/excelExport.js';

export function createExcelExportRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range.ok) {
      const response: ApiResponse<never> = { success: false, error: range.error };
      res.status(400).json(response);
      return;
    }
    const events = computeCalendarEvents(db, range.from, range.to);
    const buffer = await buildExcelBuffer(events);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="theall-calendar-${range.from}_${range.to}.xlsx"`);
    res.send(buffer);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — adds the `/export/excel` mount, everything else unchanged from Task 3):
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
import { createCalendarRouter } from './routes/calendar.js';
import { createExcelExportRouter } from './routes/excelExport.js';
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
  app.use('/calendar', createCalendarRouter(db));
  app.use('/export/excel', createExcelExportRouter(db));

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

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 10: Commit**

```bash
git add server/package.json server/src/services/calendarCategoryLabels.ts server/src/services/excelExport.ts server/src/routes/excelExport.ts server/src/app.ts server/test/excelExport.test.ts server/test/excelExportRoute.test.ts
git commit -m "feat: add Excel export for calendar events"
```

---

## Task 5: PDF export

**Files:**
- Modify: `server/package.json` (add `pdfkit`, `@reogrid/font-kr` dependencies; `@types/pdfkit` devDependency)
- Create: `server/src/services/pdfExport.ts`
- Create: `server/src/routes/pdfExport.ts`
- Modify: `server/src/app.ts` (replace the whole file — adds the `/export/pdf` mount)
- Test: `server/test/pdfExport.test.ts`
- Test: `server/test/pdfExportRoute.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` (Task 1), `computeCalendarEvents`/`parseDateRange` (Task 2), `CATEGORY_LABELS` (Task 4).
- Produces: `buildPdfBuffer(events: CalendarEvent[]): Promise<Buffer>`, `createPdfExportRouter(db: Database.Database): Router`.

- [ ] **Step 1: Add the dependencies**

In `server/package.json`, add to `"dependencies"` (alphabetical order among existing keys):
```json
"@reogrid/font-kr": "^2.0.0",
"pdfkit": "^0.20.2",
```

And to `"devDependencies"`:
```json
"@types/pdfkit": "^0.17.6",
```

`@reogrid/font-kr` is an OFL-1.1-licensed package that ships Noto Sans KR as real `.ttf` files exposed via async loader functions — used here because `pdfkit`'s built-in fonts (Helvetica, Times) have no Hangul glyphs, so student names would render blank/garbled without a Korean font registered.

Run `npm install` from the repo root (same retry note as Task 4, Step 1, if `better-sqlite3` flakes).

- [ ] **Step 2: Write the failing service test**

`server/test/pdfExport.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { buildPdfBuffer } from '../src/services/pdfExport.js';
import type { CalendarEvent } from '@theall/shared';

describe('buildPdfBuffer', () => {
  it('produces a non-empty PDF buffer for a non-empty event list', async () => {
    const events: CalendarEvent[] = [
      {
        date: '2026-09-15',
        studentId: 's1',
        studentName: '김민준',
        source: 'class',
        sourceId: 'c1',
        category: 'regular_class',
        label: '중2 수학',
        startTime: '16:00',
        endTime: '17:30'
      }
    ];

    const buffer = await buildPdfBuffer(events);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('produces a valid PDF buffer for an empty event list', async () => {
    const buffer = await buildPdfBuffer([]);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `buildPdfBuffer` does not exist yet.

- [ ] **Step 4: Implement the PDF builder**

`server/src/services/pdfExport.ts`:
```typescript
import PDFDocument from 'pdfkit';
import { loadNotoSansKRRegular } from '@reogrid/font-kr';
import type { CalendarEvent } from '@theall/shared';
import { CATEGORY_LABELS } from './calendarCategoryLabels.js';

export async function buildPdfBuffer(events: CalendarEvent[]): Promise<Buffer> {
  const fontBytes = await loadNotoSansKRRegular();
  const doc = new PDFDocument({ margin: 40 });
  doc.registerFont('NotoSansKR', Buffer.from(fontBytes));
  doc.font('NotoSansKR');

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(16).text('캘린더', { align: 'center' });
  doc.moveDown();

  for (const event of events) {
    doc
      .fontSize(10)
      .text(
        `${event.date}  ${event.studentName}  [${CATEGORY_LABELS[event.category]}]  ${event.label}  ${event.startTime}-${event.endTime}`
      );
  }

  doc.end();
  return finished;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 6: Write the failing route test**

`server/test/pdfExportRoute.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast) };
}

function bufferedGet(app: ReturnType<typeof createApp>, path: string) {
  return request(app)
    .get(path)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

describe('GET /export/pdf', () => {
  it('returns a PDF file', async () => {
    const { app } = buildApp();
    const res = await bufferedGet(app, '/export/pdf?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/export/pdf');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `/export/pdf` does not exist yet.

- [ ] **Step 8: Implement the router and wire it into `createApp`**

`server/src/routes/pdfExport.ts`:
```typescript
import { Router } from 'express';
import type { ApiResponse } from '@theall/shared';
import type Database from 'better-sqlite3';
import { computeCalendarEvents } from '../services/calendar.js';
import { parseDateRange } from '../services/dateRange.js';
import { buildPdfBuffer } from '../services/pdfExport.js';

export function createPdfExportRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range.ok) {
      const response: ApiResponse<never> = { success: false, error: range.error };
      res.status(400).json(response);
      return;
    }
    const events = computeCalendarEvents(db, range.from, range.to);
    const buffer = await buildPdfBuffer(events);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="theall-calendar-${range.from}_${range.to}.pdf"`);
    res.send(buffer);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — adds the `/export/pdf` mount, everything else unchanged from Task 4):
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
import { createCalendarRouter } from './routes/calendar.js';
import { createExcelExportRouter } from './routes/excelExport.js';
import { createPdfExportRouter } from './routes/pdfExport.js';
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
  app.use('/calendar', createCalendarRouter(db));
  app.use('/export/excel', createExcelExportRouter(db));
  app.use('/export/pdf', createPdfExportRouter(db));

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

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 10: Run the full monorepo test suite and typecheck once, as a final sanity check**

Run: `npm run test --workspaces --if-present` and `npm run typecheck --workspaces --if-present`
Expected: PASS with zero failures and zero type errors across `shared`, `server`, and `desktop`.

- [ ] **Step 11: Commit**

```bash
git add server/package.json server/src/services/pdfExport.ts server/src/routes/pdfExport.ts server/src/app.ts server/test/pdfExport.test.ts server/test/pdfExportRoute.test.ts
git commit -m "feat: add PDF export for calendar events"
```

---

## Out of scope for this plan

- The actual calendar UI (grid/month view component), category filter UI, student filter UI, export buttons — desktop UI work, handled separately.
- Category color design (hex values, visual styling) — a UI-side decision, not a backend concern.
- Per-student attendance summary reports (a different export shape than "the calendar event list as a table") — not requested; add as a follow-up if needed.
- Excel/PDF branding (logos, headers/footers) — minimal viable table output only, per the approved design.
