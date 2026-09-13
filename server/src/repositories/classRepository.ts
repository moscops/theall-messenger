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
