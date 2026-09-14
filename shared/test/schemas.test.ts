import { describe, expect, it } from 'vitest';
import {
  studentInputSchema,
  classInputSchema,
  clinicAssignmentInputSchema,
  attendanceLogInputSchema,
  scheduleExceptionInputSchema,
  studentCommentInputSchema,
  noShowAlertConfigInputSchema,
  handoverNoteInputSchema
} from '../src/schemas.js';

describe('studentInputSchema', () => {
  it('accepts a minimal valid student', () => {
    const result = studentInputSchema.safeParse({ name: '김민준' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = studentInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('classInputSchema', () => {
  it('requires at least one schedule slot', () => {
    const result = classInputSchema.safeParse({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: []
    });
    expect(result.success).toBe(false);
  });

  it('accepts a class with one schedule slot', () => {
    const result = classInputSchema.safeParse({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
    expect(result.success).toBe(true);
  });
});

describe('clinicAssignmentInputSchema', () => {
  it('rejects a bad time format', () => {
    const result = clinicAssignmentInputSchema.safeParse({
      studentId: 's1',
      dayOfWeek: 1,
      startTime: '6pm',
      endTime: '19:00'
    });
    expect(result.success).toBe(false);
  });
});

describe('attendanceLogInputSchema', () => {
  it('accepts a valid check-in', () => {
    const result = attendanceLogInputSchema.safeParse({
      studentId: 's1',
      date: '2026-09-15',
      checkInTime: '09:10'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed date', () => {
    const result = attendanceLogInputSchema.safeParse({
      studentId: 's1',
      date: '09-15-2026',
      checkInTime: '09:10'
    });
    expect(result.success).toBe(false);
  });
});

describe('scheduleExceptionInputSchema', () => {
  it('accepts an absence with no new time info', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a reschedule with no new date/time', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a reschedule with new date and time', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30'
    });
    expect(result.success).toBe(true);
  });

  it('accepts a makeup with new start/end time but no new date', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'clinic',
      targetId: 'ca1',
      exceptionType: 'makeup',
      date: '2026-09-15',
      newStartTime: '18:00',
      newEndTime: '19:00'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a makeup with no new time info', () => {
    const result = scheduleExceptionInputSchema.safeParse({
      studentId: 's1',
      targetType: 'clinic',
      targetId: 'ca1',
      exceptionType: 'makeup',
      date: '2026-09-15'
    });
    expect(result.success).toBe(false);
  });
});

describe('studentCommentInputSchema', () => {
  it('accepts a comment without a date', () => {
    const result = studentCommentInputSchema.safeParse({
      studentId: 's1',
      author: '조교',
      content: '오늘 컨디션 안 좋아 보임'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a comment with no content', () => {
    const result = studentCommentInputSchema.safeParse({
      studentId: 's1',
      author: '조교',
      content: ''
    });
    expect(result.success).toBe(false);
  });
});

describe('noShowAlertConfigInputSchema', () => {
  it('accepts a valid config', () => {
    const result = noShowAlertConfigInputSchema.safeParse({ enabled: true, delayMinutes: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects a delay of 0 minutes', () => {
    const result = noShowAlertConfigInputSchema.safeParse({ enabled: true, delayMinutes: 0 });
    expect(result.success).toBe(false);
  });
});

describe('handoverNoteInputSchema', () => {
  it('accepts a valid handover note', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026-09-15',
      author: '조교A',
      content: '내일 김민준 학생 보충 시간 변경 예정, 확인 부탁드려요'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a note with no content', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026-09-15',
      author: '조교A',
      content: ''
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = handoverNoteInputSchema.safeParse({
      date: '2026/09/15',
      author: '조교A',
      content: '내용'
    });
    expect(result.success).toBe(false);
  });
});
