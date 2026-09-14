import type { Class, ClinicAssignment, Student, StudentComment } from '@theall/shared';
import { DAY_LABELS } from './dayOfWeek';

export type SchedulePattern = 'all' | 'mon_wed_fri' | 'tue_thu' | 'custom' | 'unassigned';

export interface StudentScheduleSummary {
  pattern: SchedulePattern;
  patternLabel: string; // '월수금', '화목', '월·화·목', '미배정' 등
  patternBadgeVariant: 'blue' | 'purple' | 'orange' | 'gray';
  attendanceTimeText: string; // 등원 시간대 (예: "월·수·금 15:00~19:00", "월 15:00~19:00")
  classTimeText: string; // 수업시간 (예: "중2 수학 (월 15:00~17:00)", "클리닉 (금 17:00~19:00)")
  attendanceDays: number[]; // 등원 요일 번호 (0~6)
  enrolledClasses: Class[];
  assignedClinics: ClinicAssignment[];
  latestComment?: StudentComment;
}

export function calculateStudentSchedule(
  student: Student,
  classes: Class[] = [],
  clinics: ClinicAssignment[] = [],
  comments: StudentComment[] = []
): StudentScheduleSummary {
  const enrolledClasses = (classes || []).filter((c) => c.studentIds?.includes(student.id));
  const assignedClinics = (clinics || []).filter((cl) => cl.studentId === student.id);

  // 요일별(0~6) 수업/클리닉 슬롯 집계
  const daySlotMap = new Map<
    number,
    {
      minStart: string;
      maxEnd: string;
      classItems: { className: string; startTime: string; endTime: string }[];
      clinicItems: { startTime: string; endTime: string }[];
    }
  >();

  function registerSlot(dayOfWeek: number, startTime: string, endTime: string, className?: string) {
    if (!startTime || !endTime) return;
    if (!daySlotMap.has(dayOfWeek)) {
      daySlotMap.set(dayOfWeek, {
        minStart: startTime,
        maxEnd: endTime,
        classItems: [],
        clinicItems: []
      });
    }
    const entry = daySlotMap.get(dayOfWeek)!;
    if (startTime < entry.minStart) entry.minStart = startTime;
    if (endTime > entry.maxEnd) entry.maxEnd = endTime;

    if (className) {
      entry.classItems.push({ className, startTime, endTime });
    } else {
      entry.clinicItems.push({ startTime, endTime });
    }
  }

  // 1. 수업 슬롯 등록
  for (const cls of enrolledClasses) {
    for (const slot of cls.schedule ?? []) {
      registerSlot(slot.dayOfWeek, slot.startTime, slot.endTime, cls.name);
    }
  }

  // 2. 클리닉 슬롯 등록
  for (const cl of assignedClinics) {
    registerSlot(cl.dayOfWeek, cl.startTime, cl.endTime);
  }

  const attendanceDays = Array.from(daySlotMap.keys()).sort((a, b) => a - b);

  // 패턴 식별
  let pattern: SchedulePattern = 'custom';
  let patternLabel = '';
  let patternBadgeVariant: 'blue' | 'purple' | 'orange' | 'gray' = 'orange';

  if (attendanceDays.length === 0) {
    pattern = 'unassigned';
    patternLabel = '미배정';
    patternBadgeVariant = 'gray';
  } else if (
    attendanceDays.length === 3 &&
    attendanceDays[0] === 1 &&
    attendanceDays[1] === 3 &&
    attendanceDays[2] === 5
  ) {
    pattern = 'mon_wed_fri';
    patternLabel = '월수금';
    patternBadgeVariant = 'blue';
  } else if (
    attendanceDays.length === 2 &&
    attendanceDays[0] === 2 &&
    attendanceDays[1] === 4
  ) {
    pattern = 'tue_thu';
    patternLabel = '화목';
    patternBadgeVariant = 'purple';
  } else {
    pattern = 'custom';
    patternLabel = attendanceDays.map((d) => DAY_LABELS[d] ?? d).join('·');
    patternBadgeVariant = 'orange';
  }

  // 등원 시간대 텍스트 계산
  let attendanceTimeText = '';
  if (attendanceDays.length === 0) {
    attendanceTimeText = '—';
  } else {
    const firstDay = attendanceDays[0];
    const firstEntry = daySlotMap.get(firstDay)!;
    const allSameTime = attendanceDays.every((d) => {
      const entry = daySlotMap.get(d)!;
      return entry.minStart === firstEntry.minStart && entry.maxEnd === firstEntry.maxEnd;
    });

    if (allSameTime) {
      const daysStr = attendanceDays.map((d) => DAY_LABELS[d] ?? d).join('·');
      attendanceTimeText = `${daysStr} ${firstEntry.minStart}~${firstEntry.maxEnd}`;
    } else {
      attendanceTimeText = attendanceDays
        .map((d) => {
          const entry = daySlotMap.get(d)!;
          return `${DAY_LABELS[d]} ${entry.minStart}~${entry.maxEnd}`;
        })
        .join(', ');
    }
  }

  // 수업시간 텍스트 계산 (정규 수업 + 클리닉 상세)
  const classTextParts: string[] = [];
  for (const cls of enrolledClasses) {
    const slotGroupMap = new Map<string, number[]>();
    for (const slot of cls.schedule ?? []) {
      const timeKey = `${slot.startTime}~${slot.endTime}`;
      if (!slotGroupMap.has(timeKey)) slotGroupMap.set(timeKey, []);
      slotGroupMap.get(timeKey)!.push(slot.dayOfWeek);
    }
    const slotStrs: string[] = [];
    for (const [timeKey, days] of slotGroupMap.entries()) {
      const daysStr = days.sort((a, b) => a - b).map((d) => DAY_LABELS[d] ?? d).join('·');
      slotStrs.push(`${daysStr} ${timeKey}`);
    }
    classTextParts.push(`${cls.name} (${slotStrs.join(', ')})`);
  }

  if (assignedClinics.length > 0) {
    const clinicParts = assignedClinics.map(
      (cl) => `${DAY_LABELS[cl.dayOfWeek]} ${cl.startTime}~${cl.endTime}`
    );
    classTextParts.push(`클리닉 (${clinicParts.join(', ')})`);
  }

  const classTimeText = classTextParts.length > 0 ? classTextParts.join(', ') : '—';

  // 최신 비고(코멘트)
  let latestComment: StudentComment | undefined;
  if (comments && comments.length > 0) {
    const studentComments = comments.filter((c) => c.studentId === student.id);
    if (studentComments.length > 0) {
      studentComments.sort((a, b) => {
        const timeA = a.createdAt || a.date || a.id;
        const timeB = b.createdAt || b.date || b.id;
        return timeB.localeCompare(timeA);
      });
      latestComment = studentComments[0];
    }
  }

  return {
    pattern,
    patternLabel,
    patternBadgeVariant,
    attendanceTimeText,
    classTimeText,
    attendanceDays,
    enrolledClasses,
    assignedClinics,
    latestComment
  };
}
