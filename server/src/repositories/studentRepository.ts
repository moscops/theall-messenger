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
