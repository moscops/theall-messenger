import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ScheduleExceptionRepository } from '../src/repositories/scheduleExceptionRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';

describe('ScheduleExceptionRepository', () => {
  let db: Database.Database;
  let repo: ScheduleExceptionRepository;
  let studentId: string;
  let slotId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    studentId = new StudentRepository(db).create({ name: '김민준' }).id;
    const classRepo = new ClassRepository(db);
    const classData = classRepo.create({
      name: 'Test Class',
      teacherName: 'Test Teacher',
      schedule: [{ dayOfWeek: 1, startTime: '10:00', endTime: '11:00' }]
    });
    slotId = classData.schedule[0].id;
    repo = new ScheduleExceptionRepository(db);
  });

  it('creates and retrieves an absence exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15',
      reason: '병원 진료'
    });
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('updates an exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    const updated = repo.update(created.id, {
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-16',
      reason: '가족 행사'
    });
    expect(updated?.date).toBe('2026-09-16');
    expect(updated?.reason).toBe('가족 행사');
  });

  it('deletes an exception', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeUndefined();
  });

  it('lists exceptions ordered by date', () => {
    repo.create({ studentId, targetType: 'class', targetId: 'c1', exceptionType: 'absence', date: '2026-09-20' });
    repo.create({ studentId, targetType: 'class', targetId: 'c1', exceptionType: 'absence', date: '2026-09-15' });
    expect(repo.list().map((e) => e.date)).toEqual(['2026-09-15', '2026-09-20']);
  });

  it('creates and retrieves an exception with a classScheduleSlotId', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      classScheduleSlotId: slotId,
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(created.classScheduleSlotId).toBe(slotId);
    expect(repo.getById(created.id)?.classScheduleSlotId).toBe(slotId);
  });

  it('leaves classScheduleSlotId undefined when not provided', () => {
    const created = repo.create({
      studentId,
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(created.classScheduleSlotId).toBeUndefined();
  });
});
