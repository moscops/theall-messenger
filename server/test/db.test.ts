import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db.js';

describe('createDb', () => {
  it('creates all expected tables', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);

    expect(tables).toEqual([
      'class_enrollments',
      'class_schedule_slots',
      'classes',
      'clinic_assignments',
      'student_siblings',
      'students'
    ]);
  });
});
