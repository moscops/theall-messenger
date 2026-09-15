import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
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
      'handover_notes',
      'no_show_alert_config',
      'schedule_exceptions',
      'student_comments',
      'student_siblings',
      'students'
    ]);
  });

  describe('class_schedule_slot_id migration guard', () => {
    let tempDir: string | undefined;

    afterEach(() => {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
      tempDir = undefined;
    });

    it('adds class_schedule_slot_id to a pre-existing schedule_exceptions table missing it', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'schedule-exception-migration-'));
      const dbPath = join(tempDir, 'old-schema.sqlite3');

      // Simulate a database file created before this plan's Task 2, i.e. before
      // class_schedule_slot_id existed on schedule_exceptions.
      const oldDb = new Database(dbPath);
      oldDb.exec(`
        CREATE TABLE classes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE class_schedule_slots (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          day_of_week INTEGER NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL
        );

        CREATE TABLE students (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          grade TEXT,
          school_name TEXT,
          gender TEXT,
          phone TEXT,
          parent_phone TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE schedule_exceptions (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          exception_type TEXT NOT NULL,
          date TEXT NOT NULL,
          reason TEXT,
          new_date TEXT,
          new_start_time TEXT,
          new_end_time TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      oldDb.close();

      const preCols = new Database(dbPath)
        .prepare('PRAGMA table_info(schedule_exceptions)')
        .all() as { name: string }[];
      expect(preCols.some((c) => c.name === 'class_schedule_slot_id')).toBe(false);

      const db = createDb(dbPath);
      const postCols = db.prepare('PRAGMA table_info(schedule_exceptions)').all() as { name: string }[];
      expect(postCols.some((c) => c.name === 'class_schedule_slot_id')).toBe(true);
      db.close();
    });

    it('is idempotent when called twice in a row on the same file', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'schedule-exception-migration-'));
      const dbPath = join(tempDir, 'reopened.sqlite3');

      const db1 = createDb(dbPath);
      db1.close();

      const db2 = createDb(dbPath);
      const cols = db2.prepare('PRAGMA table_info(schedule_exceptions)').all() as { name: string }[];
      expect(cols.some((c) => c.name === 'class_schedule_slot_id')).toBe(true);
      db2.close();
    });
  });
});
