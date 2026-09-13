import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';

describe('StudentRepository', () => {
  let db: Database.Database;
  let repo: StudentRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new StudentRepository(db);
  });

  it('creates and retrieves a student', () => {
    const created = repo.create({ name: '김민준', grade: '중2' });
    const found = repo.getById(created.id);
    expect(found?.name).toBe('김민준');
    expect(found?.grade).toBe('중2');
    expect(found?.siblingIds).toEqual([]);
  });

  it('links siblings bidirectionally', () => {
    const a = repo.create({ name: '김민준' });
    const b = repo.create({ name: '김서연', siblingIds: [a.id] });
    const updatedA = repo.getById(a.id);
    expect(updatedA?.siblingIds).toEqual([b.id]);
  });

  it('updates a student', () => {
    const created = repo.create({ name: '김민준' });
    const updated = repo.update(created.id, { name: '김민준(수정)' });
    expect(updated?.name).toBe('김민준(수정)');
  });

  it('deletes a student', () => {
    const created = repo.create({ name: '김민준' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists students alphabetically by name', () => {
    repo.create({ name: '이지은' });
    repo.create({ name: '김민준' });
    const names = repo.list().map((s) => s.name);
    expect(names).toEqual(['김민준', '이지은']);
  });
});
