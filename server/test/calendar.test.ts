import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { StudentRepository } from '../src/repositories/studentRepository.js';
import { ClassRepository } from '../src/repositories/classRepository.js';
import { ClinicRepository } from '../src/repositories/clinicRepository.js';
import { computeCalendarEvents } from '../src/services/calendar.js';

// 2024-01-01 is a Monday (day 1).
const MONDAY = '2024-01-01';

describe('computeCalendarEvents', () => {
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

  it('includes a regular class occurrence on its scheduled day', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'regular_class', source: 'class' })
    ]);
  });

  it('includes a clinic occurrence on its scheduled day', () => {
    const student = students.create({ name: '이지은' });
    clinics.create({ studentId: student.id, dayOfWeek: 1, startTime: '18:00', endTime: '19:00' });

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'clinic', source: 'clinic' })
    ]);
  });

  it('marks an absent occurrence as category "absence" instead of removing it', () => {
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

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ date: MONDAY, studentId: student.id, category: 'absence' })
    ]);
  });

  it('removes a rescheduled occurrence from its original date and adds it on the new date', () => {
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

    const events = computeCalendarEvents(db, MONDAY, NEW_DATE);

    expect(events).toEqual([
      expect.objectContaining({
        date: NEW_DATE,
        studentId: student.id,
        category: 'reschedule',
        startTime: '17:00',
        endTime: '18:30'
      })
    ]);
  });

  it('deterministically prefers reschedule over absence when both exist for the same occurrence', () => {
    const student = students.create({ name: '김민준' });
    const klass = classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const NEW_DATE = '2024-01-03';
    // Insert absence first, then reschedule — same (student, target, date) key.
    db.prepare(
      `INSERT INTO schedule_exceptions (id, student_id, target_type, target_id, exception_type, date, created_at, updated_at)
       VALUES ('e1', ?, 'class', ?, 'absence', ?, '', '')`
    ).run(student.id, klass.id, MONDAY);
    db.prepare(
      `INSERT INTO schedule_exceptions
       (id, student_id, target_type, target_id, exception_type, date, new_date, new_start_time, new_end_time, created_at, updated_at)
       VALUES ('e2', ?, 'class', ?, 'reschedule', ?, ?, '17:00', '18:30', '', '')`
    ).run(student.id, klass.id, MONDAY, NEW_DATE);

    const events = computeCalendarEvents(db, MONDAY, NEW_DATE);

    expect(events).toEqual([
      expect.objectContaining({ date: NEW_DATE, category: 'reschedule', startTime: '17:00', endTime: '18:30' })
    ]);
  });

  it('adds a makeup occurrence on its date when new_date is unset, matching real API-created rows', () => {
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
       VALUES ('e1', ?, 'class', ?, 'makeup', ?, '15:00', '16:00', '', '')`
    ).run(student.id, klass.id, MAKEUP_DATE);

    const events = computeCalendarEvents(db, MAKEUP_DATE, MAKEUP_DATE);

    expect(events).toEqual([
      expect.objectContaining({ date: MAKEUP_DATE, category: 'makeup', startTime: '15:00', endTime: '16:00' })
    ]);
  });

  it('aggregates events across a multi-day range in date order', () => {
    const student = students.create({ name: '김민준' });
    classes.create({
      name: '중2 수학',
      teacherName: '박선생',
      schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: [student.id]
    });
    const NEXT_MONDAY = '2024-01-08';

    const events = computeCalendarEvents(db, MONDAY, NEXT_MONDAY);

    expect(events.map((e) => e.date)).toEqual([MONDAY, NEXT_MONDAY]);
  });

  it('only marks the targeted slot as absence when a class has two same-weekday slots and the exception targets one specific slot', () => {
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

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ startTime: '16:00', endTime: '17:30', category: 'absence' }),
      expect.objectContaining({ startTime: '18:00', endTime: '19:30', category: 'regular_class' })
    ]);
  });

  it('marks every same-weekday slot as absence when the exception has no class_schedule_slot_id', () => {
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

    const events = computeCalendarEvents(db, MONDAY, MONDAY);

    expect(events).toEqual([
      expect.objectContaining({ startTime: '16:00', category: 'absence' }),
      expect.objectContaining({ startTime: '18:00', category: 'absence' })
    ]);
  });
});
