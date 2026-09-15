import type Database from 'better-sqlite3';
import type { CalendarEvent } from '@theall/shared';

interface ClassSlotRow {
  class_id: string;
  class_name: string;
  slot_id: string;
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
  exception_type: 'absence' | 'reschedule';
  class_schedule_slot_id: string | null;
}

interface ExceptionInRow {
  student_id: string;
  target_type: 'class' | 'clinic';
  target_id: string;
  exception_type: 'reschedule' | 'makeup';
  new_start_time: string;
  new_end_time: string;
  student_name: string;
  label: string;
}

// A calendar candidate carries the class_schedule_slots.id it came from
// (class rows only — a clinic assignment has no separate slot concept, the
// clinic_assignments row IS the slot). slotId is used only to match a
// schedule exception to the exact occurrence it targets; it is stripped
// before the event is returned, since CalendarEvent has no slot-id field.
interface CalendarCandidate extends CalendarEvent {
  slotId?: string;
}

// Dates are interpreted in the server's local timezone, matching
// computeRoster's simplification for this single-LAN, single-locale tool.
function computeEventsForDate(db: Database.Database, date: string): CalendarEvent[] {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const classRows = db
    .prepare(
      `SELECT c.id as class_id, c.name as class_name, s.id as slot_id, s.start_time, s.end_time,
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

  let events: CalendarCandidate[] = [
    ...classRows.map((row) => ({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'class' as const,
      sourceId: row.class_id,
      slotId: row.slot_id,
      category: 'regular_class' as const,
      label: row.class_name,
      startTime: row.start_time,
      endTime: row.end_time
    })),
    ...clinicRows.map((row) => ({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: 'clinic' as const,
      sourceId: row.clinic_id,
      category: 'clinic' as const,
      label: '클리닉',
      startTime: row.start_time,
      endTime: row.end_time
    }))
  ];

  const exceptionsForDate = db
    .prepare(
      `SELECT student_id, target_type, target_id, exception_type, class_schedule_slot_id FROM schedule_exceptions
       WHERE date = ? AND exception_type IN ('absence', 'reschedule')`
    )
    .all(date) as ExceptionOutRow[];

  events = events.reduce<CalendarCandidate[]>((acc, event) => {
    // An exception with no class_schedule_slot_id matches every slot of the
    // target class (the original, pre-slot-targeting behavior). One with a
    // class_schedule_slot_id matches only that one slot — this is what
    // fixes classes with two or more same-weekday slots losing every
    // occurrence to a single exception.
    const matches = exceptionsForDate.filter(
      (ex) =>
        ex.student_id === event.studentId &&
        ex.target_type === event.source &&
        ex.target_id === event.sourceId &&
        (ex.class_schedule_slot_id === null || ex.class_schedule_slot_id === event.slotId)
    );
    const match = matches.find((ex) => ex.exception_type === 'reschedule') ?? matches[0];
    if (!match) {
      acc.push(event);
    } else if (match.exception_type === 'absence') {
      acc.push({ ...event, category: 'absence' });
    }
    // exception_type === 'reschedule': the occurrence moved to another date — drop it here,
    // it is re-added below on its new date. (If both an absence and a
    // reschedule exist for the same occurrence, reschedule wins deterministically —
    // see above.)
    return acc;
  }, []);

  const additions = db
    .prepare(
      `SELECT se.student_id, se.target_type, se.target_id, se.exception_type, se.new_start_time, se.new_end_time,
              st.name as student_name,
              CASE se.target_type WHEN 'class' THEN COALESCE(c.name, '(삭제된 수업)') ELSE '클리닉' END as label
       FROM schedule_exceptions se
       JOIN students st ON st.id = se.student_id
       LEFT JOIN classes c ON se.target_type = 'class' AND c.id = se.target_id
       WHERE COALESCE(se.new_date, se.date) = ? AND se.exception_type IN ('reschedule', 'makeup')`
    )
    .all(date) as ExceptionInRow[];

  for (const row of additions) {
    events.push({
      date,
      studentId: row.student_id,
      studentName: row.student_name,
      source: row.target_type,
      sourceId: row.target_id,
      category: row.exception_type,
      label: row.label,
      startTime: row.new_start_time,
      endTime: row.new_end_time
    });
  }

  return events.map(({ slotId, ...publicEvent }) => publicEvent);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

export function computeCalendarEvents(db: Database.Database, from: string, to: string): CalendarEvent[] {
  const events = enumerateDates(from, to).flatMap((date) => computeEventsForDate(db, date));
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.studentName.localeCompare(b.studentName)
  );
}
