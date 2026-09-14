import type Database from 'better-sqlite3';
import type { RosterEntry } from '@theall/shared';

interface ClassSlotRow {
  class_id: string;
  class_name: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ClinicSlotRow {
  clinic_id: string;
  start_time: string;
  end_time: string;
  student_id: string;
  student_name: string;
}

interface ExceptionOutRow {
  student_id: string;
  target_type: string;
  target_id: string;
}

interface ExceptionInRow {
  student_id: string;
  target_type: 'class' | 'clinic';
  target_id: string;
  new_start_time: string;
  new_end_time: string;
  student_name: string;
  label: string;
}

interface AttendanceRow {
  student_id: string;
  check_in_time: string;
}

// Dates are interpreted in the server's local timezone. This is a
// single-LAN internal tool where the server and its users share one
// locale, so that's an acceptable simplification.
export function computeRoster(db: Database.Database, date: string): RosterEntry[] {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const classRows = db
    .prepare(
      `SELECT c.id as class_id, c.name as class_name, s.start_time, s.end_time,
              e.student_id, st.name as student_name
       FROM class_schedule_slots s
       JOIN classes c ON c.id = s.class_id
       JOIN class_enrollments e ON e.class_id = c.id
       JOIN students st ON st.id = e.student_id
       WHERE s.day_of_week = ?`
    )
    .all(dayOfWeek) as ClassSlotRow[];

  const clinicRows = db
    .prepare(
      `SELECT ca.id as clinic_id, ca.start_time, ca.end_time, ca.student_id, st.name as student_name
       FROM clinic_assignments ca
       JOIN students st ON st.id = ca.student_id
       WHERE ca.day_of_week = ?`
    )
    .all(dayOfWeek) as ClinicSlotRow[];

  let entries: RosterEntry[] = [
    ...classRows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
      label: row.class_name,
      startTime: row.start_time,
      endTime: row.end_time,
      checkedIn: false
    })),
    ...clinicRows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'clinic' as const,
      sourceId: row.clinic_id,
      label: '클리닉',
      startTime: row.start_time,
      endTime: row.end_time,
      checkedIn: false
    }))
  ];

  const removals = db
    .prepare(
      `SELECT student_id, target_type, target_id FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  entries = entries.filter(
    (entry) =>
      !removals.some(
        (ex) => ex.student_id === entry.studentId && ex.target_type === entry.source && ex.target_id === entry.sourceId
      )
  );

  const additions = db
    .prepare(
      `SELECT se.student_id, se.target_type, se.target_id, se.new_start_time, se.new_end_time,
              st.name as student_name,
              CASE se.target_type WHEN 'class' THEN c.name ELSE '클리닉' END as label
       FROM schedule_exceptions se
       JOIN students st ON st.id = se.student_id
       LEFT JOIN classes c ON se.target_type = 'class' AND c.id = se.target_id
       WHERE COALESCE(se.new_date, se.date) = ? AND se.exception_type IN ('reschedule', 'makeup')`
    )
    .all(date) as ExceptionInRow[];

  for (const row of additions) {
    entries.push({
      studentId: row.student_id,
      studentName: row.student_name,
      source: row.target_type,
      sourceId: row.target_id,
      label: row.label,
      startTime: row.new_start_time,
      endTime: row.new_end_time,
      checkedIn: false
    });
  }

  const attendance = db
    .prepare('SELECT student_id, check_in_time FROM attendance_logs WHERE date = ?')
    .all(date) as AttendanceRow[];
  const checkInByStudent = new Map(attendance.map((row) => [row.student_id, row.check_in_time]));

  entries = entries.map((entry) => {
    const checkInTime = checkInByStudent.get(entry.studentId);
    return checkInTime ? { ...entry, checkedIn: true, checkInTime } : entry;
  });

  return entries.sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.studentName.localeCompare(b.studentName)
  );
}
