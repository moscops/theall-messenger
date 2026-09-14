import { useCallback, useEffect, useState } from 'react';
import type { Class, ClinicAssignment, HandoverNote, RosterEntry, ScheduleException, Student } from '@theall/shared';
import { alertConfigApi, attendanceApi, classesApi, clinicsApi, exceptionsApi, handoverNotesApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { todayLocal } from '../date';
import { findOverdueEntries } from '../attendanceAlerts';
import { DAY_LABELS } from '../dayOfWeek';

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function rosterKey(entry: RosterEntry): string {
  return `${entry.studentId}:${entry.sourceId}:${entry.startTime}`;
}

interface DashboardPageProps {
  onNavigateTab: (tab: string) => void;
}

export function DashboardPage({ onNavigateTab }: DashboardPageProps) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [delayMinutes, setDelayMinutes] = useState(10);
  const [quickNote, setQuickNote] = useState('');
  const [quickAuthor, setQuickAuthor] = useState('');

  const today = todayLocal();
  const dayOfWeek = new Date().getDay();

  const refreshRoster = useCallback(() => {
    attendanceApi.roster(today).then(setRoster).catch((err: unknown) => logger.error(err));
  }, [today]);

  const refreshNotes = useCallback(() => {
    handoverNotesApi.list().then(setNotes).catch((err: unknown) => logger.error(err));
  }, []);

  const refreshAll = useCallback(() => {
    refreshRoster();
    refreshNotes();
    studentsApi.list().then(setStudents).catch((err: unknown) => logger.error(err));
    classesApi.list().then(setClasses).catch((err: unknown) => logger.error(err));
    clinicsApi.list().then(setClinics).catch((err: unknown) => logger.error(err));
    exceptionsApi.list().catch((err: unknown) => logger.error(err));
    alertConfigApi.get().then((cfg) => setDelayMinutes(cfg.delayMinutes)).catch(() => {});
  }, [refreshRoster, refreshNotes]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useLiveRefresh('attendance', refreshRoster);
  useLiveRefresh('handover', refreshNotes);
  useLiveRefresh('students', refreshAll);

  const handleCheckIn = async (studentId: string) => {
    try {
      await attendanceApi.checkIn({ studentId, date: today, checkInTime: currentTime() });
      refreshRoster();
    } catch (err: unknown) {
      logger.error(err);
    }
  };

  const handleQuickNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNote.trim() || !quickAuthor.trim()) return;
    try {
      await handoverNotesApi.create({
        date: today,
        author: quickAuthor.trim(),
        content: quickNote.trim()
      });
      setQuickNote('');
      refreshNotes();
    } catch (err: unknown) {
      logger.error(err);
    }
  };

  // Metrics
  const checkedInCount = roster.filter((r) => r.checkedIn).length;
  const overdueEntries = findOverdueEntries(roster, nowMinutes(), delayMinutes);
  const uncheckInCount = roster.filter((r) => !r.checkedIn).length;

  // Today's classes
  const todayClasses = classes.filter((c) => c.schedule.some((s) => s.dayOfWeek === dayOfWeek));
  // Today's clinics
  const todayClinics = clinics.filter((c) => c.dayOfWeek === dayOfWeek);
  // Today's notes
  const todayNotes = notes.filter((n) => n.date === today);

  return (
    <div className="notion-dashboard">
      <div className="dashboard-welcome">
        <h1 className="dashboard-title">
          <span className="wave-icon">👋</span> 오늘 대시보드
        </h1>
        <p className="dashboard-subtitle">
          {today} ({DAY_LABELS[dayOfWeek]}요일) — 학원 실시간 출결 및 일정 현황을 한눈에 확인하세요.
        </p>
      </div>

      {/* Metric Cards Banner */}
      <div className="notion-metrics-grid">
        <div className="notion-metric-card green">
          <div className="metric-header">
            <span className="metric-icon">🟢</span>
            <span className="metric-label">등원 완료</span>
          </div>
          <div className="metric-value">
            {checkedInCount} <span className="metric-total">/ {roster.length}명</span>
          </div>
          <div className="metric-footer">
            {roster.length > 0 ? `${Math.round((checkedInCount / roster.length) * 100)}% 출석률` : '예정 학생 없음'}
          </div>
        </div>

        <div className="notion-metric-card orange">
          <div className="metric-header">
            <span className="metric-icon">🟡</span>
            <span className="metric-label">미등원 대기</span>
          </div>
          <div className="metric-value">{uncheckInCount}명</div>
          <div className="metric-footer">오늘 등원 예정 학생</div>
        </div>

        <div className="notion-metric-card red">
          <div className="metric-header">
            <span className="metric-icon">⚠️</span>
            <span className="metric-label">지연 알림 대상</span>
          </div>
          <div className="metric-value">{overdueEntries.length}명</div>
          <div className="metric-footer">{delayMinutes}분 이상 등원 지연</div>
        </div>

        <div className="notion-metric-card blue">
          <div className="metric-header">
            <span className="metric-icon">📚</span>
            <span className="metric-label">오늘 총 세션</span>
          </div>
          <div className="metric-value">{todayClasses.length + todayClinics.length}개</div>
          <div className="metric-footer">수업 {todayClasses.length}개 / 클리닉 {todayClinics.length}개</div>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="dashboard-split-layout">
        {/* Left: Today's Live Attendance Roster */}
        <div className="dashboard-column main-col">
          <div className="notion-card-block">
            <div className="block-header">
              <div className="block-title">
                <span className="icon">⏱️</span>
                <h3>오늘의 출결 명단</h3>
                <span className="badge-count">{roster.length}</span>
              </div>
              <button className="notion-text-link" onClick={() => onNavigateTab('attendance')}>
                전체 출결 관리 →
              </button>
            </div>

            {roster.length === 0 ? (
              <p className="empty-callout">오늘 예정된 수업이나 클리닉 학생이 없습니다.</p>
            ) : (
              <div className="roster-grid-list">
                {roster.map((entry) => {
                  const key = rosterKey(entry);
                  const isOverdue = overdueEntries.some((o) => o.key === key);
                  return (
                    <div
                      key={key}
                      className={`roster-row-card ${entry.checkedIn ? 'checked-in' : isOverdue ? 'overdue' : 'waiting'}`}
                    >
                      <div className="roster-student-info">
                        <span className="student-name">🎓 {entry.studentName}</span>
                        <span className="session-label">{entry.label}</span>
                      </div>
                      <div className="roster-time-col">
                        <span className="time-badge">
                          {entry.startTime} ~ {entry.endTime}
                        </span>
                      </div>
                      <div className="roster-status-col">
                        {entry.checkedIn ? (
                          <span className="notion-tag green">등원 완료 ({entry.checkInTime})</span>
                        ) : isOverdue ? (
                          <span className="notion-tag red">등원 지연 ⚠️</span>
                        ) : (
                          <span className="notion-tag orange">미등원</span>
                        )}
                      </div>
                      <div className="roster-action-col">
                        {!entry.checkedIn && (
                          <button
                            type="button"
                            className="notion-checkin-btn"
                            onClick={() => handleCheckIn(entry.studentId)}
                          >
                            체크인
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Handover Notes & Schedule Overview */}
        <div className="dashboard-column side-col">
          {/* Today's Handover Notes Widget */}
          <div className="notion-card-block">
            <div className="block-header">
              <div className="block-title">
                <span className="icon">📝</span>
                <h3>인수인계 메모</h3>
                <span className="badge-count">{todayNotes.length}</span>
              </div>
              <button className="notion-text-link" onClick={() => onNavigateTab('handover')}>
                전체 보기 →
              </button>
            </div>

            {/* Quick Note Add */}
            <form onSubmit={handleQuickNoteSubmit} className="dashboard-quick-note-form">
              <input
                placeholder="작성자 (예: 조교A)"
                value={quickAuthor}
                onChange={(e) => setQuickAuthor(e.target.value)}
                required
              />
              <input
                placeholder="다음 교대 조교에게 전달할 메모 입력..."
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                required
              />
              <button type="submit">등록</button>
            </form>

            <div className="dashboard-notes-list">
              {todayNotes.length === 0 ? (
                <p className="empty-callout">오늘 등록된 인수인계 메모가 없습니다.</p>
              ) : (
                todayNotes.map((note) => (
                  <div key={note.id} className="dashboard-note-item">
                    <div className="note-top">
                      <strong className="note-author">👤 {note.author}</strong>
                      <span className="note-date">{note.date}</span>
                    </div>
                    <p className="note-content">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Schedule Overview */}
          <div className="notion-card-block" style={{ marginTop: '20px' }}>
            <div className="block-header">
              <div className="block-title">
                <span className="icon">🗓️</span>
                <h3>오늘의 수업 및 클리닉</h3>
              </div>
              <button className="notion-text-link" onClick={() => onNavigateTab('calendar')}>
                통합 캘린더 →
              </button>
            </div>

            <div className="dashboard-schedule-mini-list">
              {todayClasses.map((cls) => (
                <div key={cls.id} className="mini-schedule-item class-type">
                  <span className="badge blue">수업</span>
                  <span className="name">{cls.name}</span>
                  <span className="teacher">{cls.teacherName}</span>
                </div>
              ))}
              {todayClinics.map((cl) => {
                const s = students.find((st) => st.id === cl.studentId);
                return (
                  <div key={cl.id} className="mini-schedule-item clinic-type">
                    <span className="badge purple">클리닉</span>
                    <span className="name">{s ? s.name : '학생'} 클리닉</span>
                    <span className="teacher">조교</span>
                  </div>
                );
              })}
              {todayClasses.length === 0 && todayClinics.length === 0 && (
                <p className="empty-callout">오늘 예정된 수업이나 클리닉이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
