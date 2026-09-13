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
