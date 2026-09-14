import { describe, expect, it } from 'vitest';
import type { Class, ClinicAssignment, Student, StudentComment } from '@theall/shared';
import { calculateStudentSchedule } from '../src/studentSchedule';

describe('calculateStudentSchedule', () => {
  const dummyStudent: Student = {
    id: 's1',
    name: '김민수',
    schoolName: '신사중',
    grade: '2학년',
    siblingIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  it('handles unassigned student with no classes or clinics', () => {
    const summary = calculateStudentSchedule(dummyStudent, [], []);
    expect(summary.pattern).toBe('unassigned');
    expect(summary.patternLabel).toBe('미배정');
    expect(summary.attendanceTimeText).toBe('—');
    expect(summary.classTimeText).toBe('—');
    expect(summary.attendanceDays).toEqual([]);
  });

  it('calculates mon_wed_fri schedule with class and clinic correctly', () => {
    const mathClass: Class = {
      id: 'c1',
      name: '중2 수학',
      teacherName: '박선생',
      studentIds: ['s1'],
      schedule: [
        { id: 'slot-1', dayOfWeek: 1, startTime: '15:00', endTime: '17:00' },
        { id: 'slot-2', dayOfWeek: 3, startTime: '15:00', endTime: '17:00' },
        { id: 'slot-3', dayOfWeek: 5, startTime: '15:00', endTime: '17:00' }
      ],
      createdAt: '',
      updatedAt: ''
    };

    const clinics: ClinicAssignment[] = [
      { id: 'cl1', studentId: 's1', dayOfWeek: 1, startTime: '17:00', endTime: '19:00', createdAt: '', updatedAt: '' },
      { id: 'cl2', studentId: 's1', dayOfWeek: 3, startTime: '17:00', endTime: '19:00', createdAt: '', updatedAt: '' },
      { id: 'cl3', studentId: 's1', dayOfWeek: 5, startTime: '17:00', endTime: '19:00', createdAt: '', updatedAt: '' }
    ];

    const summary = calculateStudentSchedule(dummyStudent, [mathClass], clinics);
    expect(summary.pattern).toBe('mon_wed_fri');
    expect(summary.patternLabel).toBe('월수금');
    expect(summary.attendanceTimeText).toBe('월·수·금 15:00~19:00');
    expect(summary.classTimeText).toContain('중2 수학 (월·수·금 15:00~17:00)');
    expect(summary.classTimeText).toContain('클리닉');
  });

  it('calculates tue_thu schedule pattern', () => {
    const engClass: Class = {
      id: 'c2',
      name: '고1 영어',
      teacherName: '이선생',
      studentIds: ['s1'],
      schedule: [
        { id: 'slot-4', dayOfWeek: 2, startTime: '18:00', endTime: '20:00' },
        { id: 'slot-5', dayOfWeek: 4, startTime: '18:00', endTime: '20:00' }
      ],
      createdAt: '',
      updatedAt: ''
    };

    const summary = calculateStudentSchedule(dummyStudent, [engClass], []);
    expect(summary.pattern).toBe('tue_thu');
    expect(summary.patternLabel).toBe('화목');
    expect(summary.attendanceTimeText).toBe('화·목 18:00~20:00');
  });

  it('calculates custom pattern such as mon_tue_thu with different times', () => {
    const customClass: Class = {
      id: 'c3',
      name: '특수반',
      teacherName: '최선생',
      studentIds: ['s1'],
      schedule: [
        { id: 'slot-6', dayOfWeek: 1, startTime: '15:00', endTime: '18:00' },
        { id: 'slot-7', dayOfWeek: 2, startTime: '16:00', endTime: '19:00' },
        { id: 'slot-8', dayOfWeek: 4, startTime: '15:00', endTime: '18:00' }
      ],
      createdAt: '',
      updatedAt: ''
    };

    const summary = calculateStudentSchedule(dummyStudent, [customClass], []);
    expect(summary.pattern).toBe('custom');
    expect(summary.patternLabel).toBe('월·화·목');
    expect(summary.attendanceTimeText).toBe('월 15:00~18:00, 화 16:00~19:00, 목 15:00~18:00');
  });

  it('extracts latest comment for student', () => {
    const comments: StudentComment[] = [
      { id: 'cm1', studentId: 's1', content: '옛날 메모', author: '선생1', createdAt: '2026-03-01T10:00:00Z', updatedAt: '' },
      { id: 'cm2', studentId: 's1', content: '최신 특이사항: 진도 빠름', author: '선생2', createdAt: '2026-03-10T10:00:00Z', updatedAt: '' }
    ];

    const summary = calculateStudentSchedule(dummyStudent, [], [], comments);
    expect(summary.latestComment?.content).toBe('최신 특이사항: 진도 빠름');
  });
});
