import { useCallback, useEffect, useState } from 'react';
import type { Class, ClinicAssignment, ScheduleException, Student, StudentComment } from '@theall/shared';
import { classesApi, clinicsApi, commentsApi, exceptionsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { DAY_LABELS } from '../dayOfWeek';
import { ClassIcon, ClinicIcon, SearchIcon, StudentIcon, ZoomInIcon, ZoomOutIcon } from '../components/icons';
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

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface PositionedBlock {
  block: ScheduleBlock;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
}

function layoutBlocksForDay(
  blocks: ScheduleBlock[],
  startHour: number,
  pixelsPerHour: number
): PositionedBlock[] {
  if (blocks.length === 0) return [];

  // 1. Sort by start time ascending, then longer duration first
  const sorted = [...blocks].sort((a, b) => {
    const aStart = toMinutes(a.startTime);
    const bStart = toMinutes(b.startTime);
    if (aStart !== bStart) return aStart - bStart;
    return toMinutes(b.endTime) - toMinutes(a.endTime);
  });

  // 2. Group into overlapping clusters
  const clusters: ScheduleBlock[][] = [];
  let currentCluster: ScheduleBlock[] = [];
  let clusterEnd = -1;

  sorted.forEach((b) => {
    const bStart = toMinutes(b.startTime);
    const bEnd = toMinutes(b.endTime);

    if (currentCluster.length === 0) {
      currentCluster.push(b);
      clusterEnd = bEnd;
    } else if (bStart < clusterEnd) {
      currentCluster.push(b);
      clusterEnd = Math.max(clusterEnd, bEnd);
    } else {
      clusters.push(currentCluster);
      currentCluster = [b];
      clusterEnd = bEnd;
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 3. For each cluster, assign lanes and calculate positions
  const result: PositionedBlock[] = [];

  clusters.forEach((cluster) => {
    const lanes: ScheduleBlock[][] = [];

    cluster.forEach((b) => {
      const bStart = toMinutes(b.startTime);
      let placed = false;

      for (let i = 0; i < lanes.length; i++) {
        const lastInLane = lanes[i][lanes[i].length - 1];
        if (toMinutes(lastInLane.endTime) <= bStart) {
          lanes[i].push(b);
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanes.push([b]);
      }
    });

    const totalLanes = lanes.length;
    const widthPercent = 100 / totalLanes;

    lanes.forEach((laneBlocks, laneIndex) => {
      laneBlocks.forEach((b) => {
        const startMin = toMinutes(b.startTime);
        const endMin = toMinutes(b.endTime);
        const topMinutes = startMin - startHour * 60;
        const durMinutes = Math.max(endMin - startMin, 30);

        const top = (topMinutes / 60) * pixelsPerHour;
        const height = Math.max((durMinutes / 60) * pixelsPerHour - 2, 32);
        const leftPercent = laneIndex * widthPercent;

        result.push({
          block: b,
          top,
          height,
          leftPercent,
          widthPercent
        });
      });
    });
  });

  return result;
}

type ZoomLevel = 'compact' | 'normal' | 'expanded';

const ZOOM_CONFIGS: Record<ZoomLevel, { label: string; pixelsPerHour: number; desc: string }> = {
  compact: { label: '축소', pixelsPerHour: 44, desc: '한눈에 보기' },
  normal: { label: '기본', pixelsPerHour: 66, desc: '표준 크기' },
  expanded: { label: '확대', pixelsPerHour: 96, desc: '상세 보기' }
};

const ZOOM_LEVELS: ZoomLevel[] = ['compact', 'normal', 'expanded'];

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

  // View Mode: 'timeline' (시간대별 타임테이블) or 'board' (카드 보드)
  const [viewMode, setViewMode] = useState<'timeline' | 'board'>('timeline');
  // Zoom Level: 'compact' (축소), 'normal' (기본), 'expanded' (확대)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('normal');

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

  // Korean standard week order: 월(1), 화(2), 수(3), 목(4), 금(5), 토(6), 일(0)
  const KOREAN_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const displayedDays = selectedDayOfWeek === 'all' ? KOREAN_WEEK_ORDER : [selectedDayOfWeek];

  // Calculate timeline start and end hours
  const minEventHour = allBlocks.reduce((min, b) => {
    const h = parseInt(b.startTime.split(':')[0], 10);
    return isNaN(h) ? min : Math.min(min, h);
  }, 9);
  const maxEventHour = allBlocks.reduce((max, b) => {
    const [h, m] = b.endTime.split(':').map(Number);
    const effective = m > 0 ? h + 1 : h;
    return isNaN(effective) ? max : Math.max(max, effective);
  }, 22);

  const startHour = Math.min(8, minEventHour);
  const endHour = Math.max(22, maxEventHour);

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  const pixelsPerHour = ZOOM_CONFIGS[zoomLevel].pixelsPerHour;
  const totalTimelineHeight = (endHour - startHour) * pixelsPerHour;

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_LEVELS[idx - 1]);
  };

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[idx + 1]);
  };

  const handleAddComment = async (studentId: string, content: string, author: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await commentsApi.create({ studentId, content, author, date: today });
    commentsApi.list().then(setComments).catch((err: unknown) => logger.error(err));
  };

  return (
    <div className="notion-weekly-schedule-page">
      {/* Top Header */}
      <div className="schedule-page-header">
        <div>
          <h2>수업일정</h2>
          <p className="schedule-subtitle">
            시간대별로 배치된 수업과 클리닉, 학생 참여 현황을 확인하세요. 스크롤하거나 축소하여 한눈에 조망할 수 있습니다.
          </p>
        </div>

        <div className="schedule-header-actions">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle-group">
            <button
              type="button"
              className={`mode-toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              시간표 뷰
            </button>
            <button
              type="button"
              className={`mode-toggle-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
            >
              카드 목록 뷰
            </button>
          </div>

          {/* Search by Student Name */}
          <div className="schedule-search-box">
            <SearchIcon size={14} className="search-icon" />
            <input
              type="text"
              placeholder="학생 이름으로 검색..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filter & Controls Bar */}
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

        {/* Right side: Type Filter + Zoom Controls */}
        <div className="filter-controls-right">
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

          {/* Zoom / Scale Controls (Only in timeline view) */}
          {viewMode === 'timeline' && (
            <div className="zoom-controls-group">
              <span className="zoom-label">시간축 배율:</span>
              <button
                type="button"
                className="zoom-btn icon-btn"
                onClick={handleZoomOut}
                disabled={zoomLevel === 'compact'}
                title="시간표 축소 (한눈에 보기)"
              >
                <ZoomOutIcon size={14} />
              </button>

              <div className="zoom-segmented">
                {ZOOM_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={`zoom-segment-btn ${zoomLevel === lvl ? 'active' : ''}`}
                    onClick={() => setZoomLevel(lvl)}
                  >
                    {ZOOM_CONFIGS[lvl].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="zoom-btn icon-btn"
                onClick={handleZoomIn}
                disabled={zoomLevel === 'expanded'}
                title="시간표 확대"
              >
                <ZoomInIcon size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Schedule Content */}
      {viewMode === 'timeline' ? (
        /* ================= TIMELINE TIME-GRID VIEW ================= */
        <div className="timeline-outer-scroll">
          <div
            className={`timeline-grid-wrapper ${selectedDayOfWeek === 'all' ? 'seven-cols' : 'single-col'}`}
            style={{
              minWidth: selectedDayOfWeek === 'all' ? '1200px' : '650px'
            }}
          >
            {/* Sticky Header Row */}
            <div className="timeline-header-row">
              <div className="timeline-corner-cell">
                <span>시간</span>
              </div>
              {displayedDays.map((dow) => {
                const count = allBlocks
                  .filter((b) => b.dayOfWeek === dow)
                  .filter((b) => {
                    if (!studentSearch.trim()) return true;
                    return b.students.some((s) => s.name.includes(studentSearch.trim()));
                  }).length;

                return (
                  <div key={dow} className="timeline-day-header-cell">
                    <span className="dow-title">{DAY_LABELS[dow]}요일</span>
                    <span className="dow-count-pill">{count}개 세션</span>
                  </div>
                );
              })}
            </div>

            {/* Timeline Body Area */}
            <div className="timeline-body-row" style={{ height: `${totalTimelineHeight}px` }}>
              {/* Left Time Axis (Sticky Left) */}
              <div className="timeline-time-axis-col">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="timeline-time-slot-label"
                    style={{
                      top: `${(h - startHour) * pixelsPerHour}px`,
                      height: `${pixelsPerHour}px`
                    }}
                  >
                    <span>{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {/* Day Tracks */}
              {displayedDays.map((dow) => {
                const dayBlocks = allBlocks
                  .filter((b) => b.dayOfWeek === dow)
                  .filter((b) => {
                    if (!studentSearch.trim()) return true;
                    return b.students.some((s) => s.name.includes(studentSearch.trim()));
                  });

                const positionedBlocks = layoutBlocksForDay(dayBlocks, startHour, pixelsPerHour);

                return (
                  <div key={dow} className="timeline-day-track">
                    {/* Background Grid Lines for each hour */}
                    {hours.map((h) => (
                      <div
                        key={`h-${h}`}
                        className="timeline-grid-hour-line"
                        style={{ top: `${(h - startHour) * pixelsPerHour}px` }}
                      />
                    ))}
                    {/* Background Grid Lines for half hours */}
                    {hours.slice(0, -1).map((h) => (
                      <div
                        key={`half-${h}`}
                        className="timeline-grid-half-line"
                        style={{ top: `${(h - startHour + 0.5) * pixelsPerHour}px` }}
                      />
                    ))}

                    {/* Empty Day Indicator */}
                    {positionedBlocks.length === 0 && (
                      <div className="timeline-empty-hint">일정 없음</div>
                    )}

                    {/* Positioned Event Cards */}
                    {positionedBlocks.map((pos) => {
                      const isHighlighted =
                        studentSearch.trim().length > 0 &&
                        pos.block.students.some((s) => s.name.includes(studentSearch.trim()));

                      return (
                        <div
                          key={pos.block.id}
                          className={`timeline-event-card ${pos.block.type} ${zoomLevel} ${
                            isHighlighted ? 'highlighted' : ''
                          }`}
                          style={{
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                            left: `calc(${pos.leftPercent}% + 2px)`,
                            width: `calc(${pos.widthPercent}% - 4px)`
                          }}
                        >
                          <div className="event-card-inner">
                            {/* Card Top Meta */}
                            <div className="card-top-row">
                              <span className={`block-badge ${pos.block.type}`}>
                                {pos.block.type === 'class' ? '수업' : '클리닉'}
                              </span>
                              <span className="card-time-text">
                                {pos.block.startTime}~{pos.block.endTime}
                              </span>
                            </div>

                            {/* Card Title & Supervisor */}
                            <div className="card-title-row">
                              <h4 className="card-event-name" title={pos.block.name}>
                                {pos.block.name}
                              </h4>
                              <span className="card-teacher-name">{pos.block.teacherOrSupervisor}</span>
                            </div>

                            {/* Enrolled Students Chips */}
                            <div className="card-students-row">
                              {pos.block.students.length === 0 ? (
                                <span className="card-no-students">학생 없음</span>
                              ) : (
                                pos.block.students.map((st) => (
                                  <button
                                    key={st.id}
                                    type="button"
                                    className={`student-chip-btn ${
                                      studentSearch && st.name.includes(studentSearch) ? 'search-hit' : ''
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStudent(st);
                                    }}
                                    title={`${st.name} 상세 정보 보기`}
                                  >
                                    <StudentIcon size={11} className="inline-icon" />
                                    <span>{st.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ================= BOARD COLUMN VIEW ================= */
        <div className={`schedule-columns-grid ${selectedDayOfWeek === 'all' ? 'seven-cols' : 'single-col'}`}>
          {displayedDays.map((dow) => {
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
                        <div className="block-card-header">
                          <span className={`block-badge ${block.type}`}>
                            {block.type === 'class' ? '수업' : '클리닉'}
                          </span>
                          <span className="block-time">
                            {block.startTime} ~ {block.endTime}
                          </span>
                        </div>

                        <h4 className="block-name">{block.name}</h4>
                        <div className="block-teacher">
                          <span>담당: {block.teacherOrSupervisor}</span>
                          <span className="student-count-pill">{block.students.length}명</span>
                        </div>

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
      )}

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
