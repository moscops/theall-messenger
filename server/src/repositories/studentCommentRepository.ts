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
      .prepare('SELECT * FROM student_comments ORDER BY created_at DESC, rowid DESC')
      .all() as CommentRow[];
    return rows.map(rowToComment);
  }
}
