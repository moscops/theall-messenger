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
      'attendance_logs',
      'class_enrollments',
      'class_schedule_slots',
      'classes',
      'clinic_assignments',
      'no_show_alert_config',
      'schedule_exceptions',
      'student_comments',
      'student_siblings',
      'students'
    ]);
  });
});
