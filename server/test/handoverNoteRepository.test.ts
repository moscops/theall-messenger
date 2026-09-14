import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { HandoverNoteRepository } from '../src/repositories/handoverNoteRepository.js';

describe('HandoverNoteRepository', () => {
  let db: Database.Database;
  let repo: HandoverNoteRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new HandoverNoteRepository(db);
  });

  it('creates and retrieves a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '내일 등원 변경 있음' });
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('updates a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '원래 내용' });
    const updated = repo.update(created.id, { date: '2026-09-16', author: '조교A', content: '수정된 내용' });
    expect(updated?.date).toBe('2026-09-16');
    expect(updated?.content).toBe('수정된 내용');
  });

  it('deletes a note', () => {
    const created = repo.create({ date: '2026-09-15', author: '조교A', content: '내용' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists notes with the most recent date first', () => {
    repo.create({ date: '2026-09-10', author: '조교A', content: '오래된 메모' });
    repo.create({ date: '2026-09-15', author: '조교B', content: '최근 메모' });
    expect(repo.list().map((n) => n.content)).toEqual(['최근 메모', '오래된 메모']);
  });
});
