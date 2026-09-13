import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { AttendanceRepository } from '../src/repositories/attendanceRepository.js';

describe('AttendanceRepository', () => {
  let db: Database.Database;
  let repo: AttendanceRepository;
  let studentId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    studentId = new StudentRepository(db).create({ name: '김민준' }).id;
    repo = new AttendanceRepository(db);
  });

  it('creates a new check-in', () => {
    const log = repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    expect(log.checkInTime).toBe('09:05');
    expect(repo.getByStudentAndDate(studentId, '2026-09-15')?.checkInTime).toBe('09:05');
  });

  it('updates the existing check-in instead of duplicating it for the same student and date', () => {
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:12' });

    expect(repo.listByDate('2026-09-15')).toHaveLength(1);
    expect(repo.getByStudentAndDate(studentId, '2026-09-15')?.checkInTime).toBe('09:12');
  });

  it('lists attendance for a date', () => {
    repo.checkIn({ studentId, date: '2026-09-15', checkInTime: '09:05' });
    expect(repo.listByDate('2026-09-16')).toEqual([]);
    expect(repo.listByDate('2026-09-15')).toHaveLength(1);
  });
});
