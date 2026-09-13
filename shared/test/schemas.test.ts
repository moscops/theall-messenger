import { describe, expect, it } from 'vitest';
import { studentInputSchema, classInputSchema, clinicAssignmentInputSchema } from '../src/schemas.js';

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
