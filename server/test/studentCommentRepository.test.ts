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
