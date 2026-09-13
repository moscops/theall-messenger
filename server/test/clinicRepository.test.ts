import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';

describe('ClinicRepository', () => {
  let db: Database.Database;
  let repo: ClinicRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    const students = new StudentRepository(db);
    studentId = students.create({ name: '김민준' }).id;
    repo = new ClinicRepository(db);
  });

  it('creates and retrieves a clinic assignment (no teacher field)', () => {
    const created = repo.create({ studentId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(created).not.toHaveProperty('teacherName');
    expect(repo.getById(created.id)?.studentId).toBe(studentId);
  });

  it('lists assignments ordered by day and time', () => {
    repo.create({ studentId, dayOfWeek: 5, startTime: '18:00', endTime: '19:00' });
    repo.create({ studentId, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });
    const days = repo.list().map((a) => a.dayOfWeek);
    expect(days).toEqual([1, 5]);
  });

  it('deletes an assignment', () => {
    const created = repo.create({ studentId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(repo.delete(created.id)).toBe(true);
  });
});
