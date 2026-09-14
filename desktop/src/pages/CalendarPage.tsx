import { useCallback, useEffect, useState } from 'react';
import type { Class, ClinicAssignment, HandoverNote, ScheduleException, Student } from '@theall/shared';
import { classesApi, clinicsApi, exceptionsApi, handoverNotesApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { DAY_LABELS } from '../dayOfWeek';

interface DayEvent {
  id: string;
  type: 'class' | 'clinic' | 'absence' | 'reschedule' | 'makeup' | 'handover';
  title: string;
  time?: string;
  sub?: string;
}

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const refresh = useCallback(() => {
    classesApi.list().then(setClasses).catch((err: unknown) => logger.error(err));
    clinicsApi.list().then(setClinics).catch((err: unknown) => logger.error(err));
    exceptionsApi.list().then(setExceptions).catch((err: unknown) => logger.error(err));
    handoverNotesApi.list().then(setNotes).catch((err: unknown) => logger.error(err));
    studentsApi.list().then(setStudents).catch((err: unknown) => logger.error(err));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLiveRefresh('classes', refresh);
  useLiveRefresh('clinics', refresh);
  useLiveRefresh('attendance', refresh);
  useLiveRefresh('handover', refresh);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Generate calendar days
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];

  // Prev month padding
  const prevMonthLastDate = new Date(year, month, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDate - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    days.push({
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dayNum: d,
      isCurrentMonth: false
    });
  }

  // Current month days
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true
    });
  }

  // Next month padding to fill 35 or 42 grid
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      days.push({
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        isCurrentMonth: false
      });
    }
  }

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  // Get events for a specific date
  const getEventsForDate = (dateStr: string): DayEvent[] => {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dow = dateObj.getDay();
    const events: DayEvent[] = [];

    // 1. Regular classes on this day of week
    classes.forEach((cls) => {
      cls.schedule
        .filter((slot) => slot.dayOfWeek === dow)
        .forEach((slot) => {
          events.push({
            id: `class-${cls.id}-${slot.startTime}`,
            type: 'class',
            title: cls.name,
            time: `${slot.startTime}~${slot.endTime}`,
            sub: `${cls.teacherName} (${cls.studentIds.length}명)`
          });
        });
    });

    // 2. Regular clinics on this day of week
    clinics
      .filter((clinic) => clinic.dayOfWeek === dow)
      .forEach((clinic) => {
        events.push({
          id: `clinic-${clinic.id}-${clinic.startTime}`,
          type: 'clinic',
          title: `클리닉 (${studentName(clinic.studentId)})`,
          time: `${clinic.startTime}~${clinic.endTime}`
        });
      });

    // 3. Exceptions for this date
    exceptions
      .filter((ex) => ex.date === dateStr || ex.newDate === dateStr)
      .forEach((ex) => {
        if (ex.date === dateStr) {
          if (ex.exceptionType === 'absence') {
            events.push({
              id: `ex-${ex.id}`,
              type: 'absence',
              title: `결석: ${studentName(ex.studentId)}`,
              sub: ex.reason
            });
          } else if (ex.exceptionType === 'reschedule') {
            events.push({
              id: `ex-${ex.id}`,
              type: 'reschedule',
              title: `시간변경: ${studentName(ex.studentId)}`,
              time: ex.newStartTime ? `${ex.newStartTime}~${ex.newEndTime}` : undefined,
              sub: ex.newDate ? `→ ${ex.newDate}로 변경` : undefined
            });
          }
        }
        if (ex.newDate === dateStr && (ex.exceptionType === 'makeup' || ex.exceptionType === 'reschedule')) {
          events.push({
            id: `makeup-${ex.id}`,
            type: 'makeup',
            title: `보충/변경: ${studentName(ex.studentId)}`,
            time: ex.newStartTime ? `${ex.newStartTime}~${ex.newEndTime}` : undefined,
            sub: ex.reason
          });
        }
      });

    // 4. Handover notes for this date
    notes
      .filter((n) => n.date === dateStr)
      .forEach((n) => {
        events.push({
          id: `note-${n.id}`,
          type: 'handover',
          title: `메모 (${n.author})`,
          sub: n.content
        });
      });

    return events;
  };

  const selectedDayEvents = selectedDay ? getEventsForDate(selectedDay) : [];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="notion-calendar-page">
      {/* Calendar Header Controls */}
      <div className="calendar-header-bar">
        <div className="calendar-title-group">
          <h2>
            🗓️ {year}년 {month + 1}월
          </h2>
          <div className="calendar-nav-buttons">
            <button type="button" onClick={prevMonth} className="cal-nav-btn">
              ‹
            </button>
            <button type="button" onClick={goToday} className="cal-nav-btn today-btn">
              오늘
            </button>
            <button type="button" onClick={nextMonth} className="cal-nav-btn">
              ›
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="calendar-legend">
          <span className="legend-item"><span className="dot blue"></span> 수업</span>
          <span className="legend-item"><span className="dot purple"></span> 클리닉</span>
          <span className="legend-item"><span className="dot red"></span> 결석예외</span>
          <span className="legend-item"><span className="dot orange"></span> 보충일정</span>
          <span className="legend-item"><span className="dot yellow"></span> 인수인계</span>
        </div>
      </div>

      {/* Day of Week Header */}
      <div className="calendar-dow-header">
        {DAY_LABELS.map((label, i) => (
          <div key={i} className={`dow-cell ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
            {label}요일
          </div>
        ))}
      </div>

      {/* Month Grid */}
      <div className="calendar-month-grid">
        {days.map((day, idx) => {
          const events = getEventsForDate(day.dateStr);
          const isToday = day.dateStr === todayStr;
          const isSelected = day.dateStr === selectedDay;

          return (
            <div
              key={idx}
              className={`calendar-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${
                isSelected ? 'selected' : ''
              }`}
              onClick={() => setSelectedDay(day.dateStr)}
            >
              <div className="day-cell-top">
                <span className={`day-number ${isToday ? 'today-badge' : ''}`}>{day.dayNum}</span>
                {events.length > 0 && <span className="events-count">{events.length}</span>}
              </div>

              <div className="day-events-list">
                {events.slice(0, 3).map((ev) => (
                  <div key={ev.id} className={`cal-event-pill ${ev.type}`} title={ev.title + (ev.sub ? ` - ${ev.sub}` : '')}>
                    {ev.type === 'class' && '📚 '}
                    {ev.type === 'clinic' && '🔬 '}
                    {ev.type === 'absence' && '❌ '}
                    {ev.type === 'makeup' && '⭐️ '}
                    {ev.type === 'reschedule' && '🔄 '}
                    {ev.type === 'handover' && '📝 '}
                    <span className="pill-text">{ev.title}</span>
                  </div>
                ))}
                {events.length > 3 && (
                  <div className="cal-more-events">+{events.length - 3}개 더보기</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Modal / Sheet */}
      {selectedDay && (
        <div className="calendar-detail-backdrop" onClick={() => setSelectedDay(null)}>
          <div className="calendar-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                🗓️ {selectedDay} ({DAY_LABELS[new Date(selectedDay + 'T00:00:00').getDay()]}요일) 전체 일정
              </h3>
              <button className="modal-close" onClick={() => setSelectedDay(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {selectedDayEvents.length === 0 ? (
                <p className="empty-callout">이 날짜에 등록된 수업, 클리닉, 예외 사항 또는 인수인계 메모가 없습니다.</p>
              ) : (
                <div className="modal-event-list">
                  {selectedDayEvents.map((ev) => (
                    <div key={ev.id} className={`modal-event-card ${ev.type}`}>
                      <div className="event-main">
                        <div className="event-tag-badge">
                          {ev.type === 'class' && '정규 수업'}
                          {ev.type === 'clinic' && '클리닉'}
                          {ev.type === 'absence' && '결석 예외'}
                          {ev.type === 'reschedule' && '시간 변경'}
                          {ev.type === 'makeup' && '보충 일정'}
                          {ev.type === 'handover' && '인수인계 메모'}
                        </div>
                        <h4 className="event-title">{ev.title}</h4>
                      </div>
                      {ev.time && <div className="event-time">⏰ {ev.time}</div>}
                      {ev.sub && <div className="event-sub">{ev.sub}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
