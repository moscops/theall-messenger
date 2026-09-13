# 출결 & 예외사항 (Attendance & Schedule Exceptions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 2 on top of the completed student/class/clinic master data: daily attendance check-in, a computed "who should be here right now" roster, schedule exceptions (absence/reschedule/makeup), student comments, and an optional no-show alert.

**Architecture:** Extends the existing `shared`/`server`/`desktop` monorepo — no new packages. New SQLite tables (`attendance_logs`, `schedule_exceptions`, `student_comments`, `no_show_alert_config`) and repositories follow the exact Repository pattern already used by `StudentRepository`/`ClassRepository`/`ClinicRepository`. A new read-model service (`computeRoster`) joins the existing recurring schedule (Class/ClinicAssignment) with today's exceptions and attendance to answer "who is expected right now" — this is the one piece of business logic beyond plain CRUD. No-show detection is deliberately **client-side**: the desktop `AttendancePage` polls the already-fetched roster against the alert config on a timer and uses the browser `Notification` API — this avoids a second server-side background job and a new WebSocket message shape, at the cost of only alerting while the app is open (acceptable for this LAN-only internal tool where the TA keeps the app open during hours).

**Tech Stack:** Same as sub-project 1 — TypeScript, Express, better-sqlite3, Zod, Vitest + Supertest, React 18, Vite, @testing-library/react, Electron.

**Spec:** `docs/superpowers/specs/2026-09-13-student-database-design.md` (사양의 ②출결 & 예외사항 섹션)

## Global Constraints

- Same conventions as sub-project 1: TypeScript everywhere, no `any`; Zod validation at the API boundary; `ApiResponse<T>` envelope on every route; Repository pattern (no SQL outside `repositories/` and the one `services/roster.ts` read-model); `logger` instead of raw `console.*`; Electron security baseline already in place, untouched by this plan.
- Dates are plain `YYYY-MM-DD` strings; times are `HH:MM` strings — both validated with the same regex style already used for `ScheduleSlotInput`.
- **ScheduleException semantics** (this plan's one new domain rule, not obvious from the spec's field list alone):
  - `absence`: `date` is the date the student is absent. No new-time fields.
  - `reschedule`: `date` is the **original** occurrence date being moved away from; `newDate` + `newStartTime` + `newEndTime` are where it moves to. Both are required together.
  - `makeup`: `date` is the makeup session's own date (there is no "original" occurrence to move); `newStartTime` + `newEndTime` supply the makeup session's time (`newDate` is not used for this type). Both time fields are required.
- The roster (`computeRoster`) removes a recurring occurrence on a date when an `absence` or `reschedule` exception matches `(studentId, targetType, targetId, date)`, and adds an extra entry on a date when a `reschedule` or `makeup` exception's `newDate` matches that date.
- No-show alerting is a client-side poll (see Architecture) — do not add a server-side interval or a new broadcast message type for it.
- `ChangeTopic` gains two new values: `'attendance'` (attendance logs, schedule exceptions, and alert config all broadcast on this — they all feed the same roster/alert screen) and `'comments'`.

---

## Task 1: Shared schemas for attendance, exceptions, comments, alert config, and roster

**Files:**
- Modify: `shared/src/schemas.ts` (replace the whole file — appends new schemas after the existing ones)
- Modify: `shared/src/broadcast.ts` (replace the whole file — adds two `ChangeTopic` values)
- Modify: `shared/test/schemas.test.ts` (replace the whole file — appends new test blocks)

**Interfaces:**
- Produces: `attendanceLogInputSchema`, `attendanceLogSchema`, `AttendanceLogInput`, `AttendanceLog`; `scheduleExceptionTargetTypeSchema`, `ScheduleExceptionTargetType`, `scheduleExceptionTypeSchema`, `ScheduleExceptionType`, `scheduleExceptionInputSchema`, `scheduleExceptionSchema`, `ScheduleExceptionInput`, `ScheduleException`; `studentCommentInputSchema`, `studentCommentSchema`, `StudentCommentInput`, `StudentComment`; `noShowAlertConfigInputSchema`, `noShowAlertConfigSchema`, `NoShowAlertConfigInput`, `NoShowAlertConfig`; `rosterEntrySchema`, `RosterEntry`. Updated `ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments'`. Every later task imports these from `@theall/shared`.

- [ ] **Step 1: Write the failing schema tests**

`shared/test/schemas.test.ts` (replace the whole file):
```typescript
import { describe, expect, it } from 'vitest';
import {
  studentInputSchema,
  classInputSchema,
  clinicAssignmentInputSchema,
  attendanceLogInputSchema,
  scheduleExceptionInputSchema,
  studentCommentInputSchema,
  noShowAlertConfigInputSchema
} from '../src/schemas.js';

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

describe('attendanceLogInputSchema', () => {
  it('accepts a valid check-in', () => {
    const result = attendanceLogInputSchema.safeParse({
      studentId: 's1',
      date: '2026-09-15',
      checkInTime: '09:10'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed date', () => {
    const result = attendanceLogInputSchema.safeParse({
      studentId: 's1',
      date: '09-15-2026',
      checkInTime: '09:10'
    });
    expect(result.success).toBe(false);
  });
});

describe('scheduleExceptionInputSchema', () => {
  it('accepts an absence with no new time info', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a reschedule with no new date/time', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a reschedule with new date and time', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30'
    });
    expect(result.success).toBe(true);
  });

  it('accepts a makeup with new start/end time but no new date', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'clinic',
      targetId: 'ca1',
      exceptionType: 'makeup',
      date: '2026-09-15',
      newStartTime: '18:00',
      newEndTime: '19:00'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a makeup with no new time info', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'clinic',
      targetId: 'ca1',
      exceptionType: 'makeup',
      date: '2026-09-15'
    });
    expect(result.success).toBe(false);
  });
});

describe('studentCommentInputSchema', () => {
  it('accepts a comment without a date', () => {
    const result = studentCommentInputSchema.safeParse({
      studentId: 's1',
      author: '조교',
      content: '오늘 컨디션 안 좋아 보임'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a comment with no content', () => {
    const result = studentCommentInputSchema.safeParse({
      studentId: 's1',
      author: '조교',
      content: ''
    });
    expect(result.success).toBe(false);
  });
});

describe('noShowAlertConfigInputSchema', () => {
  it('accepts a valid config', () => {
    const result = noShowAlertConfigInputSchema.safeParse({ enabled: true, delayMinutes: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects a delay of 0 minutes', () => {
    const result = noShowAlertConfigInputSchema.safeParse({ enabled: true, delayMinutes: 0 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test --workspace=shared`
Expected: FAIL — `attendanceLogInputSchema` etc. are not exported yet.

- [ ] **Step 3: Implement the schemas**

`shared/src/schemas.ts` (replace the whole file):
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
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

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

export const attendanceLogInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  date: dateStringSchema,
  checkInTime: timeSchema,
  checkOutTime: timeSchema.optional()
});
export type AttendanceLogInput = z.infer<typeof attendanceLogInputSchema>;

export const attendanceLogSchema = attendanceLogInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type AttendanceLog = z.infer<typeof attendanceLogSchema>;

export const scheduleExceptionTargetTypeSchema = z.enum(['class', 'clinic']);
export type ScheduleExceptionTargetType = z.infer<typeof scheduleExceptionTargetTypeSchema>;

export const scheduleExceptionTypeSchema = z.enum(['absence', 'reschedule', 'makeup']);
export type ScheduleExceptionType = z.infer<typeof scheduleExceptionTypeSchema>;

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
    newEndTime: timeSchema.optional()
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
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;

export const studentCommentInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  date: dateStringSchema.optional(),
  author: z.string().min(1, 'author is required'),
  content: z.string().min(1, 'content is required')
});
export type StudentCommentInput = z.infer<typeof studentCommentInputSchema>;

export const studentCommentSchema = studentCommentInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type StudentComment = z.infer<typeof studentCommentSchema>;

export const noShowAlertConfigInputSchema = z.object({
  enabled: z.boolean(),
  delayMinutes: z.number().int().min(1).max(120)
});
export type NoShowAlertConfigInput = z.infer<typeof noShowAlertConfigInputSchema>;

export const noShowAlertConfigSchema = noShowAlertConfigInputSchema;
export type NoShowAlertConfig = z.infer<typeof noShowAlertConfigSchema>;

export const rosterEntrySchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  source: scheduleExceptionTargetTypeSchema,
  sourceId: z.string(),
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  checkedIn: z.boolean(),
  checkInTime: z.string().optional()
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

`shared/src/broadcast.ts` (replace the whole file):
```typescript
export type ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments';

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
git add shared
git commit -m "feat: add attendance, exception, comment, and alert-config schemas"
```

---

## Task 2: SQLite schema for attendance, exceptions, comments, and alert config

**Files:**
- Modify: `server/src/db.ts` (replace the whole file — adds 4 tables)
- Modify: `server/test/db.test.ts` (replace the whole file — expects 10 tables)

**Interfaces:**
- Produces: 4 new tables (`attendance_logs`, `schedule_exceptions`, `student_comments`, `no_show_alert_config`). Task 3+ repositories query these.

- [ ] **Step 1: Write the failing test**

`server/test/db.test.ts` (replace the whole file):
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
      'attendance_logs',
      'class_enrollments',
      'class_schedule_slots',
      'classes',
      'clinic_assignments',
      'no_show_alert_config',
      'schedule_exceptions',
      'student_comments',
      'student_siblings',
      'students'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — the 4 new tables are not created yet.

- [ ] **Step 3: Implement the schema**

`server/src/db.ts` (replace the whole file):
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

    CREATE TABLE IF NOT EXISTS attendance_logs (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (student_id, date)
    );

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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_comments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date TEXT,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS no_show_alert_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      delay_minutes INTEGER NOT NULL
    );
  `);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db.test.ts
git commit -m "feat: add SQLite schema for attendance, exceptions, comments, alert config"
```

---

## Task 3: AttendanceRepository + POST /attendance/check-in

**Files:**
- Create: `server/src/repositories/attendanceRepository.ts`
- Create: `server/src/routes/attendance.ts`
- Modify: `server/src/app.ts` (replace the whole file)
- Test: `server/test/attendanceRepository.test.ts`
- Test: `server/test/attendanceRoute.test.ts`

**Interfaces:**
- Consumes: `attendanceLogInputSchema`/`AttendanceLogInput`/`AttendanceLog`/`ApiResponse` (Task 1), `Broadcaster` (existing).
- Produces: `class AttendanceRepository` with `checkIn(input): AttendanceLog`, `getByStudentAndDate(studentId, date): AttendanceLog | undefined`, `listByDate(date): AttendanceLog[]`. `createAttendanceRouter(repo: AttendanceRepository, broadcast: Broadcaster): Router` with `POST /check-in`. Task 4 will change this router's signature to also take `db` — expected and handled there.

- [ ] **Step 1: Write the failing repository tests**

`server/test/attendanceRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { AttendanceRepository } from '../src/repositories/attendanceRepository.js';

describe('AttendanceRepository', () => {
  let db: Database.Database;
  let repo: AttendanceRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    studentId = new StudentRepository(db).create({ name: '김민준' }).id;
    repo = new AttendanceRepository(db);
  });

  it('creates a new check-in', () => {
    const log = repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    expect(log.checkInTime).toBe('09:05');
    expect(repo.getByStudentAndDate(studentId, '2026-09-15')?.checkInTime).toBe('09:05');
  });

  it('updates the existing check-in instead of duplicating it for the same student and date', () => {
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:12' });

    expect(repo.listByDate('2026-09-15')).toHaveLength(1);
    expect(repo.getByStudentAndDate(studentId, '2026-09-15')?.checkInTime).toBe('09:12');
  });

  it('lists attendance for a date', () => {
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    expect(repo.listByDate('2026-09-16')).toEqual([]);
    expect(repo.listByDate('2026-09-15')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `AttendanceRepository` does not exist yet.

- [ ] **Step 3: Implement the repository**

`server/src/repositories/attendanceRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { AttendanceLog, AttendanceLogInput } from '@theall/shared';

interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  check_in_time: string;
  check_out_time: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAttendance(row: AttendanceRow): AttendanceLog {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.date,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AttendanceRepository {
  constructor(private db: Database.Database) {}

  checkIn(input: AttendanceLogInput): AttendanceLog {
    const now = new Date().toISOString();
    const existing = this.getByStudentAndDate(input.studentId, input.date);
    if (existing) {
      this.db
        .prepare('UPDATE attendance_logs SET check_in_time = ?, check_out_time = ?, updated_at = ? WHERE id = ?')
        .run(input.checkInTime, input.checkOutTime ?? null, now, existing.id);
      return this.getByStudentAndDate(input.studentId, input.date)!;
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO attendance_logs (id, student_id, date, check_in_time, check_out_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.studentId, input.date, input.checkInTime, input.checkOutTime ?? null, now, now);
    return this.getByStudentAndDate(input.studentId, input.date)!;
  }

  getByStudentAndDate(studentId: string, date: string): AttendanceLog | undefined {
    const row = this.db
      .prepare('SELECT * FROM attendance_logs WHERE student_id = ? AND date = ?')
      .get(studentId, date) as AttendanceRow | undefined;
    return row ? rowToAttendance(row) : undefined;
  }

  listByDate(date: string): AttendanceLog[] {
    const rows = this.db.prepare('SELECT * FROM attendance_logs WHERE date = ?').all(date) as AttendanceRow[];
    return rows.map(rowToAttendance);
  }
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing route test**

`server/test/attendanceRoute.test.ts`:
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

describe('POST /attendance/check-in', () => {
  it('creates a check-in and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: studentRes.body.data.id, date: '2026-09-15', checkInTime: '09:05' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkInTime).toBe('09:05');
    expect(broadcast).toHaveBeenCalledWith('attendance');
  });

  it('rejects a malformed date', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: 's1', date: 'not-a-date', checkInTime: '09:05' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `/attendance/check-in` does not exist yet.

- [ ] **Step 7: Implement the route and wire it into `createApp`**

`server/src/routes/attendance.ts`:
```typescript
import { Router } from 'express';
import { attendanceLogInputSchema, type ApiResponse, type AttendanceLog } from '@theall/shared';
import type { AttendanceRepository } from '../repositories/attendanceRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createAttendanceRouter(repo: AttendanceRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.post('/check-in', (req, res) => {
    const parsed = attendanceLogInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const log = repo.checkIn(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<AttendanceLog> = { success: true, data: log };
    res.status(201).json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file):
```typescript
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import type { ApiResponse } from '@theall/shared';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { AttendanceRepository } from './repositories/attendanceRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
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
  app.use('/attendance', createAttendanceRouter(new AttendanceRepository(db), broadcast));

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
git add server/src/repositories/attendanceRepository.ts server/src/routes/attendance.ts server/src/app.ts server/test/attendanceRepository.test.ts server/test/attendanceRoute.test.ts
git commit -m "feat: add attendance check-in repository and route"
```

---

## Task 4: Roster computation service + GET /attendance/roster

**Files:**
- Create: `server/src/services/roster.ts`
- Modify: `server/src/routes/attendance.ts` (replace the whole file — adds `GET /roster`, changes the factory signature to take `db`)
- Modify: `server/src/app.ts` (replace the whole file — updated `createAttendanceRouter` call)
- Test: `server/test/roster.test.ts`
- Modify: `server/test/attendanceRoute.test.ts` (replace the whole file — adds roster tests)

**Interfaces:**
- Consumes: `RosterEntry` (Task 1), `AttendanceRepository` (Task 3), existing `classes`/`class_schedule_slots`/`class_enrollments`/`clinic_assignments`/`students`/`schedule_exceptions`/`attendance_logs` tables.
- Produces: `computeRoster(db: Database.Database, date: string): RosterEntry[]`. `createAttendanceRouter(db, repo, broadcast): Router` (signature changed from Task 3 — now also takes `db`).

- [ ] **Step 1: Write the failing roster tests**

`server/test/roster.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';
import { computeRoster } from '../src/services/roster.js';

// 2024-01-01 is a Monday (day 1).
const MONDAY = '2024-01-01';

describe('computeRoster', () => {
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

  it('includes an enrolled student for a class slot matching the day of week', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, source: 'class', checkedIn: false })
    ]);
  });

  it('includes a clinic assignment matching the day of week', () => {
    const student = students.create({ name: '이지은' });
    clinics.create({ studentId: student.id, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, source: 'clinic', label: '클리닉' })
    ]);
  });

  it('excludes a student with an absence exception for that date', () => {
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

    expect(computeRoster(db, MONDAY)).toEqual([]);
  });

  it('moves a rescheduled slot from its original date to the new date', () => {
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

    expect(computeRoster(db, MONDAY)).toEqual([]);
    expect(computeRoster(db, NEW_DATE)).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '17:00', endTime: '18:30', label: '중2 수학' })
    ]);
  });

  it('adds a makeup session on its new date without touching the original schedule', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const MAKEUP_DATE = '2024-01-08';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'makeup', ?, ?, '15:00', '16:00', '', '')`
    ).run(student.id, klass.id, MAKEUP_DATE, MAKEUP_DATE);

    expect(computeRoster(db, MAKEUP_DATE)).toEqual([
      expect.objectContaining({ startTime: '15:00', endTime: '16:00', label: '중2 수학' })
    ]);
    expect(computeRoster(db, MONDAY)).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '16:00' })
    ]);
  });

  it('marks a student checked in with their check-in time', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO attendance_logs (id, student_id, date, check_in_time, created_at, updated_at)
       VALUES ('a1', ?, ?, '15:55', '', '')`
    ).run(student.id, MONDAY);

    expect(computeRoster(db, MONDAY)).toEqual([
      expect.objectContaining({ studentId: student.id, checkedIn: true, checkInTime: '15:55' })
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `server/src/services/roster.ts` does not exist yet.

- [ ] **Step 3: Implement the roster service**

`server/src/services/roster.ts`:
```typescript
import type Database from 'better-sqlite3';
import type { RosterEntry } from '@theall/shared';

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

// Dates are interpreted in the server's local timezone. This is a
// single-LAN internal tool where the server and its users share one
// locale, so that's an acceptable simplification.
export function computeRoster(db: Database.Database, date: string): RosterEntry[] {
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

  let entries: RosterEntry[] = [
    ...classRows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
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
      `SELECT student_id, target_type, target_id FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  entries = entries.filter(
    (entry) =>
      !removals.some(
        (ex) => ex.student_id === entry.studentId && ex.target_type === entry.source && ex.target_id === entry.sourceId
      )
  );

  const additions = db
    .prepare(
      `SELECT se.student_id, se.target_type, se.target_id, se.new_start_time, se.new_end_time,
              st.name as student_name,
              CASE se.target_type WHEN 'class' THEN c.name ELSE '클리닉' END as label
       FROM schedule_exceptions se
       JOIN students st ON st.id = se.student_id
       LEFT JOIN classes c ON se.target_type = 'class' AND c.id = se.target_id
       WHERE se.new_date = ? AND se.exception_type IN ('reschedule', 'makeup')`
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

  return entries.sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.studentName.localeCompare(b.studentName)
  );
}
```

- [ ] **Step 4: Run roster tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing roster route test**

`server/test/attendanceRoute.test.ts` (replace the whole file):
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

describe('POST /attendance/check-in', () => {
  it('creates a check-in and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: studentRes.body.data.id, date: '2026-09-15', checkInTime: '09:05' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkInTime).toBe('09:05');
    expect(broadcast).toHaveBeenCalledWith('attendance');
  });

  it('rejects a malformed date', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: 's1', date: 'not-a-date', checkInTime: '09:05' });
    expect(res.status).toBe(400);
  });
});

describe('GET /attendance/roster', () => {
  it('returns the computed roster for the given date', async () => {
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

    // 2024-01-01 is a Monday.
    const res = await request(app).get('/attendance/roster?date=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ studentId: studentRes.body.data.id, source: 'class', checkedIn: false })
    ]);
  });

  it('rejects a missing date query param', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/attendance/roster');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `/attendance/roster` does not exist yet.

- [ ] **Step 7: Implement the route and re-wire `createApp`**

`server/src/routes/attendance.ts` (replace the whole file):
```typescript
import { Router } from 'express';
import { attendanceLogInputSchema, type ApiResponse, type AttendanceLog, type RosterEntry } from '@theall/shared';
import type Database from 'better-sqlite3';
import type { AttendanceRepository } from '../repositories/attendanceRepository.js';
import type { Broadcaster } from '../broadcast.js';
import { computeRoster } from '../services/roster.js';

export function createAttendanceRouter(
  db: Database.Database,
  repo: AttendanceRepository,
  broadcast: Broadcaster
): Router {
  const router = Router();

  router.post('/check-in', (req, res) => {
    const parsed = attendanceLogInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const log = repo.checkIn(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<AttendanceLog> = { success: true, data: log };
    res.status(201).json(response);
  });

  router.get('/roster', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'date query param (YYYY-MM-DD) is required'
      };
      res.status(400).json(response);
      return;
    }
    const roster = computeRoster(db, date);
    const response: ApiResponse<RosterEntry[]> = { success: true, data: roster };
    res.json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — only the `createAttendanceRouter(...)` call site changes):
```typescript
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import type { ApiResponse } from '@theall/shared';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { AttendanceRepository } from './repositories/attendanceRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
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
  app.use('/attendance', createAttendanceRouter(db, new AttendanceRepository(db), broadcast));

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
git add server/src/services/roster.ts server/src/routes/attendance.ts server/src/app.ts server/test/roster.test.ts server/test/attendanceRoute.test.ts
git commit -m "feat: add roster computation service and GET /attendance/roster"
```

---

## Task 5: NoShowAlertConfigRepository + GET/PUT /attendance/alert-config

**Files:**
- Create: `server/src/repositories/noShowAlertConfigRepository.ts`
- Modify: `server/src/routes/attendance.ts` (replace the whole file — adds alert-config endpoints)
- Modify: `server/src/app.ts` (replace the whole file — updated `createAttendanceRouter` call)
- Test: `server/test/noShowAlertConfigRepository.test.ts`
- Modify: `server/test/attendanceRoute.test.ts` (replace the whole file — adds alert-config tests)

**Interfaces:**
- Consumes: `noShowAlertConfigInputSchema`/`NoShowAlertConfigInput`/`NoShowAlertConfig` (Task 1).
- Produces: `class NoShowAlertConfigRepository` with `get(): NoShowAlertConfig` (returns `{enabled: false, delayMinutes: 10}` when unset) and `update(input): NoShowAlertConfig`. `createAttendanceRouter` signature changes again to `(db, repo, alertConfigRepo, broadcast)`.

- [ ] **Step 1: Write the failing repository tests**

`server/test/noShowAlertConfigRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { NoShowAlertConfigRepository } from '../src/repositories/noShowAlertConfigRepository.js';

describe('NoShowAlertConfigRepository', () => {
  let db: Database.Database;
  let repo: NoShowAlertConfigRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new NoShowAlertConfigRepository(db);
  });

  it('defaults to disabled with a 10 minute delay when unset', () => {
    expect(repo.get()).toEqual({ enabled: false, delayMinutes: 10 });
  });

  it('persists an update and returns it on the next get', () => {
    repo.update({ enabled: true, delayMinutes: 15 });
    expect(repo.get()).toEqual({ enabled: true, delayMinutes: 15 });
  });

  it('overwrites a previous update rather than inserting a second row', () => {
    repo.update({ enabled: true, delayMinutes: 15 });
    repo.update({ enabled: false, delayMinutes: 20 });
    expect(repo.get()).toEqual({ enabled: false, delayMinutes: 20 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `NoShowAlertConfigRepository` does not exist yet.

- [ ] **Step 3: Implement the repository**

`server/src/repositories/noShowAlertConfigRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import type { NoShowAlertConfig, NoShowAlertConfigInput } from '@theall/shared';

const CONFIG_ID = 'default';
const DEFAULT_CONFIG: NoShowAlertConfig = { enabled: false, delayMinutes: 10 };

interface ConfigRow {
  enabled: number;
  delay_minutes: number;
}

export class NoShowAlertConfigRepository {
  constructor(private db: Database.Database) {}

  get(): NoShowAlertConfig {
    const row = this.db
      .prepare('SELECT enabled, delay_minutes FROM no_show_alert_config WHERE id = ?')
      .get(CONFIG_ID) as ConfigRow | undefined;
    if (!row) return DEFAULT_CONFIG;
    return { enabled: Boolean(row.enabled), delayMinutes: row.delay_minutes };
  }

  update(input: NoShowAlertConfigInput): NoShowAlertConfig {
    this.db
      .prepare(
        `INSERT INTO no_show_alert_config (id, enabled, delay_minutes) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, delay_minutes = excluded.delay_minutes`
      )
      .run(CONFIG_ID, input.enabled ? 1 : 0, input.delayMinutes);
    return this.get();
  }
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing alert-config route tests**

`server/test/attendanceRoute.test.ts` (replace the whole file — appends the new describe block to the file from Task 4):
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

describe('POST /attendance/check-in', () => {
  it('creates a check-in and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: studentRes.body.data.id, date: '2026-09-15', checkInTime: '09:05' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkInTime).toBe('09:05');
    expect(broadcast).toHaveBeenCalledWith('attendance');
  });

  it('rejects a malformed date', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: 's1', date: 'not-a-date', checkInTime: '09:05' });
    expect(res.status).toBe(400);
  });
});

describe('GET /attendance/roster', () => {
  it('returns the computed roster for the given date', async () => {
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

    const res = await request(app).get('/attendance/roster?date=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ studentId: studentRes.body.data.id, source: 'class', checkedIn: false })
    ]);
  });

  it('rejects a missing date query param', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/attendance/roster');
    expect(res.status).toBe(400);
  });
});

describe('/attendance/alert-config', () => {
  it('returns the default config when none has been set', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/attendance/alert-config');
    expect(res.body.data).toEqual({ enabled: false, delayMinutes: 10 });
  });

  it('updates the config and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const res = await request(app)
      .put('/attendance/alert-config')
      .send({ enabled: true, delayMinutes: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enabled: true, delayMinutes: 15 });
    expect(broadcast).toHaveBeenCalledWith('attendance');
  });

  it('rejects a delay of 0 minutes', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .put('/attendance/alert-config')
      .send({ enabled: true, delayMinutes: 0 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `/attendance/alert-config` does not exist yet.

- [ ] **Step 7: Implement the routes and re-wire `createApp`**

`server/src/routes/attendance.ts` (replace the whole file):
```typescript
import { Router } from 'express';
import {
  attendanceLogInputSchema,
  noShowAlertConfigInputSchema,
  type ApiResponse,
  type AttendanceLog,
  type RosterEntry,
  type NoShowAlertConfig
} from '@theall/shared';
import type Database from 'better-sqlite3';
import type { AttendanceRepository } from '../repositories/attendanceRepository.js';
import type { NoShowAlertConfigRepository } from '../repositories/noShowAlertConfigRepository.js';
import type { Broadcaster } from '../broadcast.js';
import { computeRoster } from '../services/roster.js';

export function createAttendanceRouter(
  db: Database.Database,
  repo: AttendanceRepository,
  alertConfigRepo: NoShowAlertConfigRepository,
  broadcast: Broadcaster
): Router {
  const router = Router();

  router.post('/check-in', (req, res) => {
    const parsed = attendanceLogInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const log = repo.checkIn(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<AttendanceLog> = { success: true, data: log };
    res.status(201).json(response);
  });

  router.get('/roster', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'date query param (YYYY-MM-DD) is required'
      };
      res.status(400).json(response);
      return;
    }
    const roster = computeRoster(db, date);
    const response: ApiResponse<RosterEntry[]> = { success: true, data: roster };
    res.json(response);
  });

  router.get('/alert-config', (_req, res) => {
    const response: ApiResponse<NoShowAlertConfig> = { success: true, data: alertConfigRepo.get() };
    res.json(response);
  });

  router.put('/alert-config', (req, res) => {
    const parsed = noShowAlertConfigInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const config = alertConfigRepo.update(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<NoShowAlertConfig> = { success: true, data: config };
    res.json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — only the `createAttendanceRouter(...)` call site changes):
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
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
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
git add server/src/repositories/noShowAlertConfigRepository.ts server/src/routes/attendance.ts server/src/app.ts server/test/noShowAlertConfigRepository.test.ts server/test/attendanceRoute.test.ts
git commit -m "feat: add no-show alert config repository and route"
```

---

## Task 6: ScheduleExceptionRepository + /exceptions CRUD routes

**Files:**
- Create: `server/src/repositories/scheduleExceptionRepository.ts`
- Create: `server/src/routes/exceptions.ts`
- Modify: `server/src/app.ts` (replace the whole file)
- Test: `server/test/scheduleExceptionRepository.test.ts`
- Test: `server/test/exceptionsRoute.test.ts`

**Interfaces:**
- Consumes: `scheduleExceptionInputSchema`/`ScheduleExceptionInput`/`ScheduleException`/`ApiResponse` (Task 1).
- Produces: `class ScheduleExceptionRepository` with `create/update/delete/getById/list` (same shape as `StudentRepository`). `createExceptionsRouter(repo, broadcast): Router`.

- [ ] **Step 1: Write the failing repository tests**

`server/test/scheduleExceptionRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ScheduleExceptionRepository } from '../src/repositories/scheduleExceptionRepository.js';

describe('ScheduleExceptionRepository', () => {
  let db: Database.Database;
  let repo: ScheduleExceptionRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    studentId = new StudentRepository(db).create({ name: '김민준' }).id;
    repo = new ScheduleExceptionRepository(db);
  });

  it('creates and retrieves an absence exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15',
      reason: '병원 진료'
    });
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('updates an exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    const updated = repo.update(created.id, {
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-16',
      reason: '가족 행사'
    });
    expect(updated?.date).toBe('2026-09-16');
    expect(updated?.reason).toBe('가족 행사');
  });

  it('deletes an exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists exceptions ordered by date', () => {
    repo.create({ studentId, targetType: 'class', targetId: 'c1', exceptionType: 'absence', date: '2026-09-20' });
    repo.create({ studentId, targetType: 'class', targetId: 'c1', exceptionType: 'absence', date: '2026-09-15' });
    expect(repo.list().map((e) => e.date)).toEqual(['2026-09-15', '2026-09-20']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `ScheduleExceptionRepository` does not exist yet.

- [ ] **Step 3: Implement the repository**

`server/src/repositories/scheduleExceptionRepository.ts`:
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
         (id, student_id, target_type, target_id, exception_type, date, reason, new_date, new_start_time, new_end_time, created_at, updated_at)
         VALUES (@id, @studentId, @targetType, @targetId, @exceptionType, @date, @reason, @newDate, @newStartTime, @newEndTime, @createdAt, @updatedAt)`
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
         new_start_time = @newStartTime, new_end_time = @newEndTime, updated_at = @updatedAt
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

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing route tests**

`server/test/exceptionsRoute.test.ts`:
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

describe('/exceptions', () => {
  it('creates and lists an exception, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('attendance');

    const listRes = await request(app).get('/exceptions');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a reschedule with no new time information', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'reschedule',
        date: '2026-09-15'
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a missing exception', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .patch('/exceptions/does-not-exist')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(res.status).toBe(404);
  });

  it('deletes an exception', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    const deleteRes = await request(app).delete(`/exceptions/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/exceptions` does not exist yet.

- [ ] **Step 7: Implement the router and wire it into `createApp`**

`server/src/routes/exceptions.ts`:
```typescript
import { Router } from 'express';
import { scheduleExceptionInputSchema, type ApiResponse, type ScheduleException } from '@theall/shared';
import type { ScheduleExceptionRepository } from '../repositories/scheduleExceptionRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createExceptionsRouter(repo: ScheduleExceptionRepository, broadcast: Broadcaster): Router {
  const router = Router();

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

`server/src/app.ts` (replace the whole file — adds the `/exceptions` mount):
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
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createExceptionsRouter } from './routes/exceptions.js';
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
  app.use('/exceptions', createExceptionsRouter(new ScheduleExceptionRepository(db), broadcast));

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
git add server/src/repositories/scheduleExceptionRepository.ts server/src/routes/exceptions.ts server/src/app.ts server/test/scheduleExceptionRepository.test.ts server/test/exceptionsRoute.test.ts
git commit -m "feat: add schedule exception repository and REST routes"
```

---

## Task 7: StudentCommentRepository + /comments CRUD routes

**Files:**
- Create: `server/src/repositories/studentCommentRepository.ts`
- Create: `server/src/routes/comments.ts`
- Modify: `server/src/app.ts` (replace the whole file)
- Test: `server/test/studentCommentRepository.test.ts`
- Test: `server/test/commentsRoute.test.ts`

**Interfaces:**
- Consumes: `studentCommentInputSchema`/`StudentCommentInput`/`StudentComment`/`ApiResponse` (Task 1).
- Produces: `class StudentCommentRepository` with `create/update/delete/getById/list`. `createCommentsRouter(repo, broadcast): Router`, broadcasting on topic `'comments'`.

- [ ] **Step 1: Write the failing repository tests**

`server/test/studentCommentRepository.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { StudentCommentRepository } from '../src/repositories/studentCommentRepository.js';

describe('StudentCommentRepository', () => {
  let db: Database.Database;
  let repo: StudentCommentRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    studentId = new StudentRepository(db).create({ name: '김민준' }).id;
    repo = new StudentCommentRepository(db);
  });

  it('creates and retrieves a comment without a date', () => {
    const created = repo.create({ studentId, author: '조교', content: '오늘 집중을 잘함' });
    expect(repo.getById(created.id)?.date).toBeUndefined();
  });

  it('updates a comment', () => {
    const created = repo.create({ studentId, author: '조교', content: '원래 내용' });
    const updated = repo.update(created.id, { studentId, author: '조교', content: '수정된 내용' });
    expect(updated?.content).toBe('수정된 내용');
  });

  it('deletes a comment', () => {
    const created = repo.create({ studentId, author: '조교', content: '내용' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists comments newest first', () => {
    repo.create({ studentId, author: '조교', content: '첫 번째' });
    repo.create({ studentId, author: '조교', content: '두 번째' });
    expect(repo.list().map((c) => c.content)).toEqual(['두 번째', '첫 번째']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `StudentCommentRepository` does not exist yet.

- [ ] **Step 3: Implement the repository**

`server/src/repositories/studentCommentRepository.ts`:
```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { StudentComment, StudentCommentInput } from '@theall/shared';

interface CommentRow {
  id: string;
  student_id: string;
  date: string | null;
  author: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function rowToComment(row: CommentRow): StudentComment {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.date ?? undefined,
    author: row.author,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class StudentCommentRepository {
  constructor(private db: Database.Database) {}

  create(input: StudentCommentInput): StudentComment {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO student_comments (id, student_id, date, author, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.studentId, input.date ?? null, input.author, input.content, now, now);
    return this.getById(id)!;
  }

  update(id: string, input: StudentCommentInput): StudentComment | undefined {
    if (!this.getById(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE student_comments SET student_id = ?, date = ?, author = ?, content = ?, updated_at = ? WHERE id = ?'
      )
      .run(input.studentId, input.date ?? null, input.author, input.content, now, id);
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM student_comments WHERE id = ?').run(id).changes > 0;
  }

  getById(id: string): StudentComment | undefined {
    const row = this.db.prepare('SELECT * FROM student_comments WHERE id = ?').get(id) as
      | CommentRow
      | undefined;
    return row ? rowToComment(row) : undefined;
  }

  list(): StudentComment[] {
    const rows = this.db
      .prepare('SELECT * FROM student_comments ORDER BY created_at DESC')
      .all() as CommentRow[];
    return rows.map(rowToComment);
  }
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Write the failing route tests**

`server/test/commentsRoute.test.ts`:
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

describe('/comments', () => {
  it('creates and lists a comment, and broadcasts on the comments topic', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/comments')
      .send({ studentId: studentRes.body.data.id, author: '조교', content: '오늘 집중을 잘함' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('comments');

    const listRes = await request(app).get('/comments');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an empty content field', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/comments')
      .send({ studentId: 's1', author: '조교', content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleting a missing comment', async () => {
    const { app } = buildApp();
    const res = await request(app).delete('/comments/does-not-exist');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `/comments` does not exist yet.

- [ ] **Step 7: Implement the router and wire it into `createApp`**

`server/src/routes/comments.ts`:
```typescript
import { Router } from 'express';
import { studentCommentInputSchema, type ApiResponse, type StudentComment } from '@theall/shared';
import type { StudentCommentRepository } from '../repositories/studentCommentRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createCommentsRouter(repo: StudentCommentRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<StudentComment[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = studentCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const comment = repo.create(parsed.data);
    broadcast('comments');
    const response: ApiResponse<StudentComment> = { success: true, data: comment };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = studentCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const comment = repo.update(req.params.id, parsed.data);
    if (!comment) {
      const response: ApiResponse<never> = { success: false, error: 'comment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('comments');
    const response: ApiResponse<StudentComment> = { success: true, data: comment };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'comment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('comments');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
```

`server/src/app.ts` (replace the whole file — adds the `/comments` mount):
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
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createExceptionsRouter } from './routes/exceptions.js';
import { createCommentsRouter } from './routes/comments.js';
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
  app.use('/exceptions', createExceptionsRouter(new ScheduleExceptionRepository(db), broadcast));
  app.use('/comments', createCommentsRouter(new StudentCommentRepository(db), broadcast));

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
Expected: PASS (all tests, zero failures — this is the last server task, run the full suite once here)

- [ ] **Step 9: Commit**

```bash
git add server/src/repositories/studentCommentRepository.ts server/src/routes/comments.ts server/src/app.ts server/test/studentCommentRepository.test.ts server/test/commentsRoute.test.ts
git commit -m "feat: add student comment repository and REST routes"
```

---

## Task 8: Desktop API client extensions

**Files:**
- Modify: `desktop/src/api/client.ts` (replace the whole file)
- Modify: `desktop/test/client.test.ts` (replace the whole file — appends new describe blocks)

**Interfaces:**
- Consumes: `AttendanceLog`/`AttendanceLogInput`/`RosterEntry`/`NoShowAlertConfig`/`NoShowAlertConfigInput`/`ScheduleException`/`ScheduleExceptionInput`/`StudentComment`/`StudentCommentInput` (Task 1).
- Produces: `attendanceApi.{roster, checkIn}`, `alertConfigApi.{get, update}`, `exceptionsApi.{list, create, update, remove}`, `commentsApi.{list, create, update, remove}`. Tasks 10-12 import these.

- [ ] **Step 1: Write the failing tests**

`desktop/test/client.test.ts` (replace the whole file):
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studentsApi, classesApi, clinicsApi, attendanceApi, alertConfigApi, exceptionsApi, commentsApi } from '../src/api/client';

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    json: async () => body
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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

  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '이지은' } });

    await studentsApi.create({ name: '이지은' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: '이지은' });
  });

  it('sends a PATCH with the correct URL, method, and body on update()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '이지은(수정)' } });

    await studentsApi.update('1', { name: '이지은(수정)' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students/1',
      expect.objectContaining({ method: 'PATCH' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: '이지은(수정)' });
  });

  it('sends a DELETE to the correct URL on remove()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: null });

    await studentsApi.remove('1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students/1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('classesApi', () => {
  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '중2 수학' } });

    await classesApi.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/classes',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
  });
});

describe('clinicsApi', () => {
  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', studentId: 's1' } });

    await clinicsApi.create({
      studentId: 's1',
      dayOfWeek: 3,
      startTime: '18:00',
      endTime: '19:00'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/clinics',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      studentId: 's1',
      dayOfWeek: 3,
      startTime: '18:00',
      endTime: '19:00'
    });
  });
});

describe('attendanceApi', () => {
  it('requests the roster for a date via the query string', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: [] });

    await attendanceApi.roster('2026-09-15');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/roster?date=2026-09-15',
      expect.objectContaining({})
    );
  });

  it('sends a POST with the correct body on checkIn()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'a1' } });

    await attendanceApi.checkIn({ studentId: 's1', date: '2026-09-15', checkInTime: '09:05' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/check-in',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      studentId: 's1',
      date: '2026-09-15',
      checkInTime: '09:05'
    });
  });
});

describe('alertConfigApi', () => {
  it('sends a PUT with the correct body on update()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { enabled: true, delayMinutes: 15 } });

    await alertConfigApi.update({ enabled: true, delayMinutes: 15 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/alert-config',
      expect.objectContaining({ method: 'PUT' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ enabled: true, delayMinutes: 15 });
  });
});

describe('exceptionsApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'e1' } });

    await exceptionsApi.create({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/exceptions',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('commentsApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'c1' } });

    await commentsApi.create({ studentId: 's1', author: '조교', content: '내용' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/comments',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `attendanceApi` etc. are not exported yet.

- [ ] **Step 3: Implement the client extensions**

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
  StudentCommentInput
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/api/client.ts desktop/test/client.test.ts
git commit -m "feat: add attendance, exceptions, and comments to the API client"
```

---

## Task 9: Client-side overdue-entry detection (`attendanceAlerts.ts`)

**Files:**
- Create: `desktop/src/attendanceAlerts.ts`
- Test: `desktop/test/attendanceAlerts.test.ts`

**Interfaces:**
- Consumes: `RosterEntry` (Task 1).
- Produces: `findOverdueEntries(roster: RosterEntry[], nowMinutes: number, delayMinutes: number): OverdueEntry[]` where `OverdueEntry` is a `RosterEntry` plus a stable `key` string. Task 10's `AttendancePage` uses this to decide which students to notify about, and to de-duplicate repeated notifications.

- [ ] **Step 1: Write the failing tests**

`desktop/test/attendanceAlerts.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { findOverdueEntries } from '../src/attendanceAlerts';
import type { RosterEntry } from '@theall/shared';

const baseEntry: RosterEntry = {
  studentId: 's1',
  studentName: '김민준',
  source: 'class',
  sourceId: 'c1',
  label: '중2 수학',
  startTime: '16:00',
  endTime: '17:30',
  checkedIn: false
};

describe('findOverdueEntries', () => {
  it('flags an entry once the delay has passed and the student has not checked in', () => {
    const overdue = findOverdueEntries([baseEntry], 16 * 60 + 10, 5);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].key).toBe('s1:c1:16:00');
  });

  it('does not flag an entry before the delay has passed', () => {
    const overdue = findOverdueEntries([baseEntry], 16 * 60 + 3, 5);
    expect(overdue).toHaveLength(0);
  });

  it('does not flag a student who already checked in', () => {
    const checkedIn = { ...baseEntry, checkedIn: true, checkInTime: '16:02' };
    const overdue = findOverdueEntries([checkedIn], 16 * 60 + 20, 5);
    expect(overdue).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `src/attendanceAlerts.ts` does not exist yet.

- [ ] **Step 3: Implement it**

`desktop/src/attendanceAlerts.ts`:
```typescript
import type { RosterEntry } from '@theall/shared';

export interface OverdueEntry extends RosterEntry {
  key: string;
}

function minutesSinceMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function findOverdueEntries(
  roster: RosterEntry[],
  nowMinutes: number,
  delayMinutes: number
): OverdueEntry[] {
  return roster
    .filter((entry) => !entry.checkedIn)
    .filter((entry) => nowMinutes - minutesSinceMidnight(entry.startTime) >= delayMinutes)
    .map((entry) => ({ ...entry, key: `${entry.studentId}:${entry.sourceId}:${entry.startTime}` }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/attendanceAlerts.ts desktop/test/attendanceAlerts.test.ts
git commit -m "feat: add pure overdue-entry detection for no-show alerts"
```

---

## Task 10: AttendancePage

**Files:**
- Create: `desktop/src/pages/AttendancePage.tsx`
- Test: `desktop/test/AttendancePage.test.tsx`

**Interfaces:**
- Consumes: `attendanceApi`, `alertConfigApi` (Task 8), `findOverdueEntries` (Task 9), `useLiveRefresh` (existing).
- Produces: `AttendancePage` component — Task 13 renders it inside `App`.

- [ ] **Step 1: Write the failing test**

`desktop/test/AttendancePage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendancePage } from '../src/pages/AttendancePage';
import { attendanceApi, alertConfigApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  attendanceApi: { roster: vi.fn(), checkIn: vi.fn() },
  alertConfigApi: { get: vi.fn(), update: vi.fn() }
}));

describe('AttendancePage', () => {
  it("lists today's roster and checks a student in", async () => {
    vi.mocked(alertConfigApi.get).mockResolvedValue({ enabled: false, delayMinutes: 10 });
    vi.mocked(attendanceApi.roster).mockResolvedValue([
      {
        studentId: 's1',
        studentName: '김민준',
        source: 'class',
        sourceId: 'c1',
        label: '중2 수학',
        startTime: '16:00',
        endTime: '17:30',
        checkedIn: false
      }
    ]);
    vi.mocked(attendanceApi.checkIn).mockResolvedValue({
      id: 'a1',
      studentId: 's1',
      date: '2026-01-01',
      checkInTime: '16:01',
      createdAt: '',
      updatedAt: ''
    });

    render(<AttendancePage />);
    await screen.findByText('김민준');

    await userEvent.click(screen.getByText('체크인'));

    await waitFor(() => expect(attendanceApi.checkIn).toHaveBeenCalled());
    const [input] = vi.mocked(attendanceApi.checkIn).mock.calls[0];
    expect(input.studentId).toBe('s1');
    expect(input.checkInTime).toMatch(/^\d{2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `src/pages/AttendancePage.tsx` does not exist yet.

- [ ] **Step 3: Implement the page**

`desktop/src/pages/AttendancePage.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoShowAlertConfigInput, RosterEntry } from '@theall/shared';
import { alertConfigApi, attendanceApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { findOverdueEntries } from '../attendanceAlerts';

const today = new Date().toISOString().slice(0, 10);
const CHECK_INTERVAL_MS = 30_000;

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function AttendancePage() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [alertConfig, setAlertConfig] = useState<NoShowAlertConfigInput>({ enabled: false, delayMinutes: 10 });
  const [error, setError] = useState<string | null>(null);
  const notifiedKeys = useRef(new Set<string>());

  const refresh = useCallback(() => {
    attendanceApi.roster(today).then(setRoster).catch((error: unknown) => logger.error(error));
  }, []);

  const refreshConfig = useCallback(() => {
    alertConfigApi.get().then(setAlertConfig).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(refreshConfig, [refreshConfig]);
  useLiveRefresh('attendance', refresh);
  useLiveRefresh('attendance', refreshConfig);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!alertConfig.enabled) return;
    const interval = setInterval(() => {
      const overdue = findOverdueEntries(roster, nowMinutes(), alertConfig.delayMinutes);
      for (const entry of overdue) {
        if (notifiedKeys.current.has(entry.key)) continue;
        notifiedKeys.current.add(entry.key);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('미출석 알림', {
            body: `${entry.studentName} - ${entry.label} (${entry.startTime})`
          });
        }
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [roster, alertConfig]);

  const handleCheckIn = async (studentId: string) => {
    try {
      await attendanceApi.checkIn({ studentId, date: today, checkInTime: currentTime() });
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleConfigSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const updated = await alertConfigApi.update(alertConfig);
      setAlertConfig(updated);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  return (
    <div>
      <h2>출결 ({today})</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>수업/클리닉</th>
            <th>시간</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry) => (
            <tr key={`${entry.studentId}-${entry.sourceId}-${entry.startTime}`}>
              <td>{entry.studentName}</td>
              <td>{entry.label}</td>
              <td>
                {entry.startTime}-{entry.endTime}
              </td>
              <td>{entry.checkedIn ? `등원 완료 (${entry.checkInTime})` : '미등원'}</td>
              <td>{!entry.checkedIn && <button onClick={() => handleCheckIn(entry.studentId)}>체크인</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleConfigSubmit}>
        <p>미출석 알림</p>
        <label>
          <input
            type="checkbox"
            checked={alertConfig.enabled}
            onChange={(e) => setAlertConfig({ ...alertConfig, enabled: e.target.checked })}
          />
          알림 켜기
        </label>
        <input
          type="number"
          min={1}
          max={120}
          value={alertConfig.delayMinutes}
          onChange={(e) => setAlertConfig({ ...alertConfig, delayMinutes: Number(e.target.value) })}
        />
        <button type="submit">저장</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/AttendancePage.tsx desktop/test/AttendancePage.test.tsx
git commit -m "feat: add AttendancePage with roster, check-in, and alert settings"
```

---

## Task 11: ExceptionsPage

**Files:**
- Create: `desktop/src/pages/ExceptionsPage.tsx`
- Test: `desktop/test/ExceptionsPage.test.tsx`

**Interfaces:**
- Consumes: `exceptionsApi`, `studentsApi`, `classesApi`, `clinicsApi` (Task 8 / existing), `useLiveRefresh`.
- Produces: `ExceptionsPage` component — Task 13 renders it inside `App`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/ExceptionsPage.test.tsx`:
```tsx
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsPage } from '../src/pages/ExceptionsPage';
import { classesApi, clinicsApi, exceptionsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  exceptionsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ExceptionsPage', () => {
  it('shows the class name instead of a raw target id', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([
      {
        id: 'e1',
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15',
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<ExceptionsPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('중2 수학')).toBeInTheDocument();
    expect(within(table).getByText('결석')).toBeInTheDocument();
  });

  it('requires new date and time fields for a reschedule before submitting', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [],
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
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30',
      createdAt: '',
      updatedAt: ''
    });

    render(<ExceptionsPage />);
    await screen.findByText('중2 수학');

    await userEvent.selectOptions(screen.getByDisplayValue('학생 선택'), 's1');
    await userEvent.selectOptions(screen.getByDisplayValue('대상 선택'), 'c1');
    await userEvent.selectOptions(screen.getByDisplayValue('결석'), '시간변경');

    const dateInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'date');
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-15' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-09-17' } });
    const timeInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'time');
    fireEvent.change(timeInputs[0], { target: { value: '17:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '18:30' } });

    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(exceptionsApi.create).toHaveBeenCalled());
    const [input] = vi.mocked(exceptionsApi.create).mock.calls[0];
    expect(input).toMatchObject({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30'
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `src/pages/ExceptionsPage.tsx` does not exist yet.

- [ ] **Step 3: Implement the page**

`desktop/src/pages/ExceptionsPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type {
  Class,
  ClinicAssignment,
  ScheduleException,
  ScheduleExceptionInput,
  Student
} from '@theall/shared';
import { classesApi, clinicsApi, exceptionsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: ScheduleExceptionInput = {
  studentId: '',
  targetType: 'class',
  targetId: '',
  exceptionType: 'absence',
  date: ''
};

const EXCEPTION_TYPE_LABELS: Record<ScheduleExceptionInput['exceptionType'], string> = {
  absence: '결석',
  reschedule: '시간변경',
  makeup: '보충추가'
};

export function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [form, setForm] = useState<ScheduleExceptionInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    exceptionsApi.list().then(setExceptions).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
    classesApi.list().then(setClasses).catch((error: unknown) => logger.error(error));
    clinicsApi.list().then(setClinics).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('attendance', refresh);

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  const targetLabel = (targetType: string, targetId: string) => {
    if (targetType === 'class') {
      return classes.find((c) => c.id === targetId)?.name ?? targetId;
    }
    const clinic = clinics.find((c) => c.id === targetId);
    return clinic ? `클리닉(${studentName(clinic.studentId)})` : targetId;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await exceptionsApi.create(form);
      setForm(emptyForm);
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
      await exceptionsApi.remove(id);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const targetOptions: Array<Class | ClinicAssignment> = form.targetType === 'class' ? classes : clinics;
  const needsNewTime = form.exceptionType === 'reschedule' || form.exceptionType === 'makeup';

  return (
    <div>
      <h2>일정 예외</h2>
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>대상</th>
            <th>유형</th>
            <th>날짜</th>
            <th>사유</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((exception) => (
            <tr key={exception.id}>
              <td>{studentName(exception.studentId)}</td>
              <td>{targetLabel(exception.targetType, exception.targetId)}</td>
              <td>{EXCEPTION_TYPE_LABELS[exception.exceptionType]}</td>
              <td>{exception.date}</td>
              <td>{exception.reason}</td>
              <td>
                <button onClick={() => handleDelete(exception.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p style={{ color: 'red' }}>{error}</p>}
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
        <select
          value={form.targetType}
          onChange={(e) =>
            setForm({ ...form, targetType: e.target.value as ScheduleExceptionInput['targetType'], targetId: '' })
          }
        >
          <option value="class">수업</option>
          <option value="clinic">클리닉</option>
        </select>
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
        <select
          value={form.exceptionType}
          onChange={(e) =>
            setForm({ ...form, exceptionType: e.target.value as ScheduleExceptionInput['exceptionType'] })
          }
        >
          <option value="absence">결석</option>
          <option value="reschedule">시간변경</option>
          <option value="makeup">보충추가</option>
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <input
          placeholder="사유"
          value={form.reason ?? ''}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        {needsNewTime && (
          <>
            {form.exceptionType === 'reschedule' && (
              <input
                type="date"
                value={form.newDate ?? ''}
                onChange={(e) => setForm({ ...form, newDate: e.target.value })}
                required
              />
            )}
            <input
              type="time"
              value={form.newStartTime ?? ''}
              onChange={(e) => setForm({ ...form, newStartTime: e.target.value })}
              required
            />
            <input
              type="time"
              value={form.newEndTime ?? ''}
              onChange={(e) => setForm({ ...form, newEndTime: e.target.value })}
              required
            />
          </>
        )}
        <button type="submit">추가</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures). If the second test's field-targeting proves too brittle against the real rendered element order, adjust the test to target inputs more directly (e.g. add a `name` attribute to each input and query by it) — the important behavior to lock down is that `exceptionsApi.create` receives all four reschedule fields, not the exact query mechanics.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/ExceptionsPage.tsx desktop/test/ExceptionsPage.test.tsx
git commit -m "feat: add ExceptionsPage for absence/reschedule/makeup entries"
```

---

## Task 12: CommentsPage

**Files:**
- Create: `desktop/src/pages/CommentsPage.tsx`
- Test: `desktop/test/CommentsPage.test.tsx`

**Interfaces:**
- Consumes: `commentsApi`, `studentsApi` (Task 8 / existing), `useLiveRefresh`.
- Produces: `CommentsPage` component — Task 13 renders it inside `App`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/CommentsPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommentsPage } from '../src/pages/CommentsPage';
import { commentsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  commentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('CommentsPage', () => {
  it('lists existing comments with the student name resolved', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(commentsApi.list).mockResolvedValue([
      { id: 'c1', studentId: 's1', author: '조교', content: '오늘 집중을 잘함', createdAt: '', updatedAt: '' }
    ]);

    render(<CommentsPage />);

    expect(await screen.findByText(/오늘 집중을 잘함/)).toBeInTheDocument();
  });

  it('submits a new comment for the selected student', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(commentsApi.list).mockResolvedValue([]);
    vi.mocked(commentsApi.create).mockResolvedValue({
      id: 'c1',
      studentId: 's1',
      author: '조교',
      content: '숙제 다 해옴',
      createdAt: '',
      updatedAt: ''
    });

    render(<CommentsPage />);
    await screen.findByText('김민준');

    const studentSelects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(studentSelects[studentSelects.length - 1], 's1');
    await userEvent.type(screen.getByPlaceholderText('작성자'), '조교');
    await userEvent.type(screen.getByPlaceholderText('내용'), '숙제 다 해옴');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(commentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 's1', author: '조교', content: '숙제 다 해옴' })
      )
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `src/pages/CommentsPage.tsx` does not exist yet.

- [ ] **Step 3: Implement the page**

`desktop/src/pages/CommentsPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Student, StudentComment, StudentCommentInput } from '@theall/shared';
import { commentsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: StudentCommentInput = { studentId: '', author: '', content: '' };

export function CommentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [comments, setComments] = useState<StudentComment[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [form, setForm] = useState<StudentCommentInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    commentsApi.list().then(setComments).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('comments', refresh);

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  const visibleComments = selectedStudentId
    ? comments.filter((comment) => comment.studentId === selectedStudentId)
    : comments;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await commentsApi.create(form);
      setForm({ ...emptyForm, studentId: form.studentId });
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
      await commentsApi.remove(id);
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
      <h2>학생 코멘트</h2>
      <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
        <option value="">전체 학생</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name}
          </option>
        ))}
      </select>
      <ul>
        {visibleComments.map((comment) => (
          <li key={comment.id}>
            [{studentName(comment.studentId)}] {comment.date ? `${comment.date} ` : ''}
            {comment.author}: {comment.content}
            <button onClick={() => handleDelete(comment.id)}>삭제</button>
          </li>
        ))}
      </ul>
      {error && <p style={{ color: 'red' }}>{error}</p>}
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
        <input
          placeholder="작성자"
          value={form.author}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
          required
        />
        <input type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=desktop`
Expected: PASS (all tests, zero failures)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pages/CommentsPage.tsx desktop/test/CommentsPage.test.tsx
git commit -m "feat: add CommentsPage for per-student notes"
```

---

## Task 13: App shell navigation for the three new tabs

**Files:**
- Modify: `desktop/src/App.tsx` (replace the whole file)
- Modify: `desktop/test/App.test.tsx` (replace the whole file)

**Interfaces:**
- Consumes: `AttendancePage` (Task 10), `ExceptionsPage` (Task 11), `CommentsPage` (Task 12).
- Produces: `App` now renders 6 tabs instead of 3.

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
  commentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=desktop`
Expected: FAIL — `App` does not have 출결/일정 예외/코멘트 tabs yet.

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

type Tab = 'students' | 'classes' | 'clinics' | 'attendance' | 'exceptions' | 'comments';

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
      </nav>
      {tab === 'students' && <StudentsPage />}
      {tab === 'classes' && <ClassesPage />}
      {tab === 'clinics' && <ClinicPage />}
      {tab === 'attendance' && <AttendancePage />}
      {tab === 'exceptions' && <ExceptionsPage />}
      {tab === 'comments' && <CommentsPage />}
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
git commit -m "feat: add attendance, exceptions, and comments tabs to the app shell"
```

---

## Out of scope for this plan

- A date picker on `AttendancePage` to view/check-in a day other than today — the user explicitly asked for "오늘 와야 할 학생 목록" (today's roster); a historical/future view is a follow-up if needed.
- Server-side no-show alerting (background interval + a dedicated WebSocket alert message) — deliberately replaced with client-side polling per the Architecture note. Revisit only if a second client type (e.g. a phone app) needs alerts without the desktop app open.
- Editing an existing `ScheduleException` from the UI (the API supports `PATCH`, but `ExceptionsPage` only wires create/delete) — add an edit form if this turns out to be needed in practice.
- Any calendar/Excel/PDF export view — that is sub-project 4 per the design spec's decomposition.
