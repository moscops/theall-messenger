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
