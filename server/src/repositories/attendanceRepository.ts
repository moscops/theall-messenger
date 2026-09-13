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
