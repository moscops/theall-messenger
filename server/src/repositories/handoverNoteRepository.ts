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
