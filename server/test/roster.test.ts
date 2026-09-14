import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';
import { computeRoster } from '../src/services/roster.js';

// 2024-01-01 is a Monday (day 1).
const MONDAY = '2024-01-01';

describe('computeRoster', () => {
  let db: Database.Database;
  let students: StudentRepository;
  let classes: ClassRepository;
  let clinics: ClinicRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    students = new StudentRepository(db);
    classes = new ClassRepository(db);
    clinics = new ClinicRepository(db);
  });

  it('includes an enrolled student for a class slot matching the day of week', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, source: 'class', checkedIn: false })
    ]);
  });

  it('includes a clinic assignment matching the day of week', () => {
    const student = students.create({ name: '이지은' });
    clinics.create({ studentId: student.id, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, source: 'clinic', label: '클리닉' })
    ]);
  });

  it('excludes a student with an absence exception for that date', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);

    expect(computeRoster(db, MONDAY)).toEqual([]);
  });

  it('moves a rescheduled slot from its original date to the new date', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const NEW_DATE = '2024-01-03';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'reschedule', ?, ?, '17:00', '18:30', '', '')`
    ).run(student.id, klass.id, MONDAY, NEW_DATE);

    expect(computeRoster(db, MONDAY)).toEqual([]);
    expect(computeRoster(db, NEW_DATE)).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '17:00', endTime: '18:30', label: '중2 수학' })
    ]);
  });

  it('adds a makeup session on its new date without touching the original schedule', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const MAKEUP_DATE = '2024-01-02';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'makeup', ?, ?, '15:00', '16:00', '', '')`
    ).run(student.id, klass.id, MAKEUP_DATE, MAKEUP_DATE);

    expect(computeRoster(db, MAKEUP_DATE)).toEqual([
      expect.objectContaining({ startTime: '15:00', endTime: '16:00', label: '중2 수학' })
    ]);
    expect(computeRoster(db, MONDAY)).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '16:00' })
    ]);
  });

  it('adds a makeup session whose new_date is unset, matching real API-created rows', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const MAKEUP_DATE = '2024-01-02';
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e2', ?, 'class', ?, 'makeup', ?, '15:00', '16:00', '', '')`
    ).run(student.id, klass.id, MAKEUP_DATE);

    expect(computeRoster(db, MAKEUP_DATE)).toContainEqual(
      expect.objectContaining({ studentId: student.id, startTime: '15:00', endTime: '16:00', label: '중2 수학' })
    );
  });

  it('marks a student checked in with their check-in time', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO attendance_logs (id, student_id, date, check_in_time, created_at, updated_at)
       VALUES ('a1', ?, ?, '15:55', '', '')`
    ).run(student.id, MONDAY);

    expect(computeRoster(db, MONDAY)).toEqual([
      expect.objectContaining({ studentId: student.id, checkedIn: true, checkInTime: '15:55' })
    ]);
  });

  it('only removes the targeted slot when a class has two same-weekday slots and the exception targets one specific slot', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    const targetedSlotId = klass.schedule[0].id;
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, class_schedule_slot_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, targetedSlotId, MONDAY);

    const roster = computeRoster(db, MONDAY);

    expect(roster).toEqual([
      expect.objectContaining({ studentId: student.id, startTime: '18:00', endTime: '19:30' })
    ]);
  });

  it('removes every same-weekday slot of the class when the exception has no class_schedule_slot_id', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
      ],
      studentIds: [student.id]
    });
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);

    expect(computeRoster(db, MONDAY)).toEqual([]);
  });
});
