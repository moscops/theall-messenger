import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';

describe('ClassRepository', () => {
  let db: Database.Database;
  let students: StudentRepository;
  let repo: ClassRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    students = new StudentRepository(db);
    repo = new ClassRepository(db);
  });

  it('creates a class with schedule and enrollment', () => {
    const student = students.create({ name: '김민준' });
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    expect(created.schedule).toHaveLength(1);
    expect(created.studentIds).toEqual([student.id]);
  });

  it('replaces schedule and enrollment on update', () => {
    const student = students.create({ name: '김민준' });
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const updated = repo.update(created.id, {
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 4, startTime: '18:00', endTime: '19:30' }],
      studentIds: []
    });

    expect(updated?.schedule).toEqual([
      expect.objectContaining({ dayOfWeek: 4, startTime: '18:00', endTime: '19:30' })
    ]);
    expect(updated?.studentIds).toEqual([]);
  });

  it('deletes a class', () => {
    const created = repo.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });
});
