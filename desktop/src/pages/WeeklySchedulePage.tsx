import { useCallback, useEffect, useState } from 'react';
import type { Class, ClinicAssignment, ScheduleException, Student, StudentComment } from '@theall/shared';
import { classesApi, clinicsApi, commentsApi, exceptionsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { DAY_LABELS } from '../dayOfWeek';
import { ClassIcon, ClinicIcon, SearchIcon, StudentIcon } from '../components/icons';
import { StudentDetailPanel } from '../components/StudentDetailPanel';

interface ScheduleBlock {
  id: string;
  type: 'class' | 'clinic';
  name: string;
  teacherOrSupervisor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  students: Student[];
}

export function WeeklySchedulePage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [comments, setComments] = useState<StudentComment[]>([]);

  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'class' | 'clinic'>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const refresh = useCallback(() => {
    classesApi.list().then(setClasses).catch((err: unknown) => logger.error(err));
    clinicsApi.list().then(setClinics).catch((err: unknown) => logger.error(err));
    studentsApi.list().then(setStudents).catch((err: unknown) => logger.error(err));
    exceptionsApi.list().then(setExceptions).catch((err: unknown) => logger.error(err));
    commentsApi.list().then(setComments).catch((err: unknown) => logger.error(err));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLiveRefresh('classes', refresh);
  useLiveRefresh('clinics', refresh);
  useLiveRefresh('students', refresh);
  useLiveRefresh('attendance', refresh);
  useLiveRefresh('comments', refresh);

  // Build all schedule blocks
  const allBlocks: ScheduleBlock[] = [];

  // 1. Classes
  if (typeFilter === 'all' || typeFilter === 'class') {
    classes.forEach((cls) => {
      cls.schedule.forEach((slot) => {
        const enrolledStudents = students.filter((s) => cls.studentIds.includes(s.id));
        allBlocks.push({
          id: `class-${cls.id}-${slot.dayOfWeek}-${slot.startTime}`,
          type: 'class',
          name: cls.name,
          teacherOrSupervisor: cls.teacherName,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          students: enrolledStudents
        });
      });
    });
  }

  // 2. Clinics
  if (typeFilter === 'all' || typeFilter === 'clinic') {
    clinics.forEach((clinic) => {
      const student = students.find((s) => s.id === clinic.studentId);
      allBlocks.push({
        id: `clinic-${clinic.id}-${clinic.dayOfWeek}-${clinic.startTime}`,
        type: 'clinic',
        name: student ? `${student.name} 클리닉` : '개별 클리닉',
        teacherOrSupervisor: '조교',
        dayOfWeek: clinic.dayOfWeek,
        startTime: clinic.startTime,
        endTime: clinic.endTime,
        students: student ? [student] : []
      });
    });
  }

  // Days to show: either 0-6 (Mon-Sun or Sun-Sat) or single day
  // Let's order standard Korean week order: 월(1), 화(2), 수(3), 목(4), 금(5), 토(6), 일(0)
  const KOREAN_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const displayedDays = selectedDayOfWeek === 'all' ? KOREAN_WEEK_ORDER : [selectedDayOfWeek];

  const handleAddComment = async (studentId: string, content: string, author: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await commentsApi.create({ studentId, content, author, date: today });
    commentsApi.list().then(setComments).catch((err: unknown) => logger.error(err));
  };

  return (
    <div className="notion-weekly-schedule-page">
      {/* Top Header & Filters */}
      <div className="schedule-page-header">
        <div>
          <h2>수업일정</h2>
          <p className="schedule-subtitle">
            요일 및 시간대별로 배치된 수업과 클리닉, 그리고 참여 학생 명단을 확인하세요.
          </p>
        </div>

        {/* Search by Student Name */}
        <div className="schedule-search-box">
          <SearchIcon size={14} className="search-icon" />
          <input
            type="text"
            placeholder="학생 이름으로 수업 찾기..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="schedule-filter-bar">
        {/* Day Selector */}
        <div className="day-selector-group">
          <button
            type="button"
            className={`day-tab-btn ${selectedDayOfWeek === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedDayOfWeek('all')}
          >
            일주일 전체
          </button>
          {KOREAN_WEEK_ORDER.map((dow) => (
            <button
              key={dow}
              type="button"
              className={`day-tab-btn ${selectedDayOfWeek === dow ? 'active' : ''}`}
              onClick={() => setSelectedDayOfWeek(dow)}
            >
              {DAY_LABELS[dow]}요일
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="type-selector-group">
          <button
            type="button"
            className={`type-filter-chip ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            전체
          </button>
          <button
            type="button"
            className={`type-filter-chip ${typeFilter === 'class' ? 'active' : ''}`}
            onClick={() => setTypeFilter('class')}
          >
            <ClassIcon size={13} className="inline-icon" />
            수업만
          </button>
          <button
            type="button"
            className={`type-filter-chip ${typeFilter === 'clinic' ? 'active' : ''}`}
            onClick={() => setTypeFilter('clinic')}
          >
            <ClinicIcon size={13} className="inline-icon" />
            클리닉만
          </button>
        </div>
      </div>

      {/* Schedule Timetable Columns */}
      <div className={`schedule-columns-grid ${selectedDayOfWeek === 'all' ? 'seven-cols' : 'single-col'}`}>
        {displayedDays.map((dow) => {
          // Get and sort blocks for this day
          const dayBlocks = allBlocks
            .filter((b) => b.dayOfWeek === dow)
            .filter((b) => {
              if (!studentSearch.trim()) return true;
              return b.students.some((s) => s.name.includes(studentSearch.trim()));
            })
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <div key={dow} className="schedule-day-column">
              <div className="day-column-header">
                <span className="day-label">{DAY_LABELS[dow]}요일</span>
                <span className="count-badge">{dayBlocks.length}개 세션</span>
              </div>

              <div className="day-column-body">
                {dayBlocks.length === 0 ? (
                  <div className="empty-day-placeholder">배치된 일정이 없습니다.</div>
                ) : (
                  dayBlocks.map((block) => (
                    <div
                      key={block.id}
                      className={`schedule-block-card ${block.type} ${
                        studentSearch && block.students.some((s) => s.name.includes(studentSearch))
                          ? 'highlighted'
                          : ''
                      }`}
                    >
                      {/* Top Meta */}
                      <div className="block-card-header">
                        <span className={`block-badge ${block.type}`}>
                          {block.type === 'class' ? '수업' : '클리닉'}
                        </span>
                        <span className="block-time">
                          {block.startTime} ~ {block.endTime}
                        </span>
                      </div>

                      {/* Title & Teacher */}
                      <h4 className="block-name">{block.name}</h4>
                      <div className="block-teacher">
                        <span>담당: {block.teacherOrSupervisor}</span>
                        <span className="student-count-pill">{block.students.length}명</span>
                      </div>

                      {/* Enrolled Students Chips */}
                      <div className="block-students-section">
                        <div className="students-label">배치된 학생:</div>
                        <div className="students-chip-list">
                          {block.students.length === 0 ? (
                            <span className="no-students">등록 학생 없음</span>
                          ) : (
                            block.students.map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                className={`student-chip-btn ${
                                  studentSearch && st.name.includes(studentSearch) ? 'search-hit' : ''
                                }`}
                                onClick={() => setSelectedStudent(st)}
                                title="클릭하여 상세 정보 보기"
                              >
                                <StudentIcon size={12} className="inline-icon" />
                                <span>{st.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notion Side-Peek Detail Panel on Student Click */}
      {selectedStudent && (
        <StudentDetailPanel
          student={selectedStudent}
          allStudents={students}
          classes={classes}
          clinics={clinics}
          exceptions={exceptions}
          comments={comments}
          onClose={() => setSelectedStudent(null)}
          onEdit={() => {}}
          onDelete={() => {}}
          onAddComment={handleAddComment}
          onSelectStudent={(s) => setSelectedStudent(s)}
        />
      )}
    </div>
  );
}
