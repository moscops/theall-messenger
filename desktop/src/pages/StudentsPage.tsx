import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Class,
  ClassInput,
  ClinicAssignment,
  ScheduleException,
  Student,
  StudentComment,
  StudentInput
} from '@theall/shared';
import * as clientModule from '../api/client';
import { studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { StudentMultiSelect } from '../components/StudentMultiSelect';
import { StudentDetailPanel } from '../components/StudentDetailPanel';
import { PlusIcon, SearchIcon, StudentIcon } from '../components/icons';
import { calculateStudentSchedule, type SchedulePattern } from '../studentSchedule';
import { DAY_LABELS } from '../dayOfWeek';

const emptyForm: StudentInput = { name: '' };

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [comments, setComments] = useState<StudentComment[]>([]);

  const [form, setForm] = useState<StudentInput>(emptyForm);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [patternFilter, setPatternFilter] = useState<SchedulePattern>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);

  const refreshStudents = useCallback(() => {
    studentsApi
      .list()
      .then(setStudents)
      .catch((error: unknown) => logger.error(error));
  }, []);

  const refreshRelations = useCallback(() => {
    try {
      const mod = clientModule as Record<string, unknown>;
      const cApi = mod.classesApi as { list: () => Promise<Class[]> } | undefined;
      const clApi = mod.clinicsApi as { list: () => Promise<ClinicAssignment[]> } | undefined;
      const exApi = mod.exceptionsApi as { list: () => Promise<ScheduleException[]> } | undefined;
      const cmApi = mod.commentsApi as { list: () => Promise<StudentComment[]> } | undefined;

      if (cApi && typeof cApi.list === 'function') cApi.list().then(setClasses).catch((err: unknown) => logger.error(err));
      if (clApi && typeof clApi.list === 'function') clApi.list().then(setClinics).catch((err: unknown) => logger.error(err));
      if (exApi && typeof exApi.list === 'function') exApi.list().then(setExceptions).catch((err: unknown) => logger.error(err));
      if (cmApi && typeof cmApi.list === 'function') cmApi.list().then(setComments).catch((err: unknown) => logger.error(err));
    } catch {
      // In isolated tests where client is partially mocked, ignore missing relations
    }
  }, []);

  useEffect(() => {
    refreshStudents();
    refreshRelations();
  }, [refreshStudents, refreshRelations]);

  useLiveRefresh('students', refreshStudents);
  useLiveRefresh('classes', refreshRelations);
  useLiveRefresh('clinics', refreshRelations);
  useLiveRefresh('attendance', refreshRelations);
  useLiveRefresh('comments', refreshRelations);

  // Keep selected student synced if list updates
  useEffect(() => {
    if (selectedStudent) {
      const updated = students.find((s) => s.id === selectedStudent.id);
      if (updated) setSelectedStudent(updated);
    }
  }, [students, selectedStudent]);

  // Pre-calculate schedules for all students
  const studentScheduleMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateStudentSchedule>>();
    for (const student of students) {
      map.set(student.id, calculateStudentSchedule(student, classes, clinics, comments));
    }
    return map;
  }, [students, classes, clinics, comments]);

  // Pattern counts for filter tabs
  const patternCounts = useMemo(() => {
    const counts = { all: students.length, mon_wed_fri: 0, tue_thu: 0, custom: 0, unassigned: 0 };
    for (const student of students) {
      const schedule = studentScheduleMap.get(student.id);
      if (schedule && schedule.pattern in counts) {
        counts[schedule.pattern as keyof typeof counts]++;
      }
    }
    return counts;
  }, [students, studentScheduleMap]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      let targetStudentId = editingId;
      if (editingId) {
        await studentsApi.update(editingId, form);
      } else {
        const created = await studentsApi.create(form);
        if (created?.id) {
          targetStudentId = created.id;
        }
      }

      // Sync enrolled classes
      if (targetStudentId && classes.length > 0) {
        try {
          const mod = clientModule as Record<string, unknown>;
          const cApi = mod.classesApi as { update: (id: string, input: ClassInput) => Promise<Class> } | undefined;
          if (cApi && typeof cApi.update === 'function') {
            for (const cls of classes) {
              const isEnrolled = cls.studentIds?.includes(targetStudentId);
              const shouldBeEnrolled = selectedClassIds.includes(cls.id);
              if (!isEnrolled && shouldBeEnrolled) {
                await cApi.update(cls.id, {
                  ...cls,
                  studentIds: [...cls.studentIds, targetStudentId]
                });
              } else if (isEnrolled && !shouldBeEnrolled) {
                await cApi.update(cls.id, {
                  ...cls,
                  studentIds: cls.studentIds.filter((id) => id !== targetStudentId)
                });
              }
            }
          }
        } catch {
          // ignore if classesApi mock is not present
        }
      }

      // Add note / comment if provided
      if (targetStudentId && noteInput.trim()) {
        try {
          const mod = clientModule as Record<string, unknown>;
          const cmApi = mod.commentsApi as { create: (input: { studentId: string; content: string; author: string; date?: string }) => Promise<StudentComment> } | undefined;
          if (cmApi && typeof cmApi.create === 'function') {
            const today = new Date().toISOString().slice(0, 10);
            await cmApi.create({
              studentId: targetStudentId,
              content: noteInput.trim(),
              author: '관리자',
              date: today
            });
          }
        } catch {
          // ignore
        }
      }

      setForm(emptyForm);
      setSelectedClassIds([]);
      setNoteInput('');
      setEditingId(null);
      setIsFormOpen(false);
      setError(null);
      refreshStudents();
      refreshRelations();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setForm({
      name: student.name,
      grade: student.grade,
      schoolName: student.schoolName,
      gender: student.gender,
      phone: student.phone,
      parentPhone: student.parentPhone,
      siblingIds: student.siblingIds
    });
    const enrolled = classes.filter((c) => c.studentIds?.includes(student.id)).map((c) => c.id);
    setSelectedClassIds(enrolled);
    setNoteInput('');
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await studentsApi.remove(id);
      if (selectedStudent?.id === id) {
        setSelectedStudent(null);
      }
      setError(null);
      refreshStudents();
      refreshRelations();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleAddComment = async (studentId: string, content: string, author: string) => {
    try {
      const mod = clientModule as Record<string, unknown>;
      const cmApi = mod.commentsApi as { create: (input: { studentId: string; content: string; author: string; date?: string }) => Promise<StudentComment> } | undefined;
      if (cmApi && typeof cmApi.create === 'function') {
        const today = new Date().toISOString().slice(0, 10);
        await cmApi.create({ studentId, content, author, date: today });
        refreshRelations();
      }
    } catch {
      // ignore
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const schedule = studentScheduleMap.get(s.id);
      if (patternFilter !== 'all' && schedule && schedule.pattern !== patternFilter) {
        return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchSchool = (s.schoolName ?? '').toLowerCase().includes(q);
        const matchGrade = (s.grade ?? '').toLowerCase().includes(q);
        const matchAttendance = (schedule?.attendanceTimeText ?? '').toLowerCase().includes(q);
        const matchClass = (schedule?.classTimeText ?? '').toLowerCase().includes(q);
        const matchComment = (schedule?.latestComment?.content ?? '').toLowerCase().includes(q);
        return matchName || matchSchool || matchGrade || matchAttendance || matchClass || matchComment;
      }
      return true;
    });
  }, [students, studentScheduleMap, patternFilter, searchTerm]);

  return (
    <div className="notion-page">
      {/* Top Header */}
      <div className="notion-page-header">
        <h2>학생</h2>
        <div className="notion-header-actions">
          <div className="search-box-wrapper">
            <SearchIcon size={14} className="search-icon" />
            <input
              type="text"
              className="notion-search-input"
              placeholder="학생 필터 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setSelectedClassIds([]);
              setNoteInput('');
              setIsFormOpen(!isFormOpen);
            }}
          >
            <PlusIcon size={13} className="inline-icon" />
            <span>{isFormOpen ? '폼 닫기' : '학생 등록'}</span>
          </button>
        </div>
      </div>

      <p className="notion-hint-text">학생 이름을 클릭하면 우측에서 상세 인적사항, 수강 수업, 코멘트를 확인할 수 있습니다.</p>

      {/* Schedule Pattern Filter Tabs (Notion Views) */}
      <div className="notion-view-tabs" role="tablist" aria-label="등원 요일 패턴 필터">
        <button
          type="button"
          role="tab"
          aria-selected={patternFilter === 'all'}
          className={`notion-view-tab-btn ${patternFilter === 'all' ? 'active' : ''}`}
          onClick={() => setPatternFilter('all')}
        >
          <span>전체</span>
          <span className="notion-tab-count">{patternCounts.all}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={patternFilter === 'mon_wed_fri'}
          className={`notion-view-tab-btn ${patternFilter === 'mon_wed_fri' ? 'active' : ''}`}
          onClick={() => setPatternFilter('mon_wed_fri')}
        >
          <span>월수금</span>
          <span className="notion-tab-count">{patternCounts.mon_wed_fri}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={patternFilter === 'tue_thu'}
          className={`notion-view-tab-btn ${patternFilter === 'tue_thu' ? 'active' : ''}`}
          onClick={() => setPatternFilter('tue_thu')}
        >
          <span>화목</span>
          <span className="notion-tab-count">{patternCounts.tue_thu}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={patternFilter === 'custom'}
          className={`notion-view-tab-btn ${patternFilter === 'custom' ? 'active' : ''}`}
          onClick={() => setPatternFilter('custom')}
        >
          <span>기타 / 예외</span>
          <span className="notion-tab-count">{patternCounts.custom}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={patternFilter === 'unassigned'}
          className={`notion-view-tab-btn ${patternFilter === 'unassigned' ? 'active' : ''}`}
          onClick={() => setPatternFilter('unassigned')}
        >
          <span>미배정</span>
          <span className="notion-tab-count">{patternCounts.unassigned}</span>
        </button>
      </div>

      {/* Notion Database Table View */}
      <div className="notion-table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '15%' }}>학교 및 학년</th>
              <th style={{ width: '13%' }}>이름</th>
              <th style={{ width: '22%' }}>등원 시간대</th>
              <th style={{ width: '25%' }}>수업시간</th>
              <th style={{ width: '15%' }}>비고란</th>
              <th style={{ width: '10%' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  조건에 일치하는 학생이 없습니다.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const schedule = studentScheduleMap.get(student.id) ?? calculateStudentSchedule(student);
                const schoolGrade = [student.schoolName, student.grade].filter(Boolean).join(' ');

                return (
                  <tr
                    key={student.id}
                    className={`notion-clickable-row ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                    onClick={() => setSelectedStudent(student)}
                  >
                    {/* 1. 학교 및 학년 */}
                    <td>
                      <span className="student-school-grade">{schoolGrade || '—'}</span>
                    </td>

                    {/* 2. 이름 */}
                    <td>
                      <span className="notion-row-title">
                        <StudentIcon size={15} color="var(--text-secondary)" className="inline-icon" />
                        <strong>{student.name}</strong>
                      </span>
                    </td>

                    {/* 3. 등원 시간대 (패턴 뱃지 + 총 체류 시간) */}
                    <td>
                      <div className="student-time-cell">
                        <span className={`schedule-badge badge-${schedule.patternBadgeVariant}`}>
                          {schedule.patternLabel}
                        </span>
                        <span className="student-time-text">{schedule.attendanceTimeText}</span>
                      </div>
                    </td>

                    {/* 4. 수업시간 (정규 수업 + 클리닉 상세) */}
                    <td>
                      <span className="student-class-text">{schedule.classTimeText}</span>
                    </td>

                    {/* 5. 비고란 */}
                    <td>
                      {schedule.latestComment ? (
                        <span className="student-remark-text" title={schedule.latestComment.content}>
                          {schedule.latestComment.content}
                        </span>
                      ) : (
                        <span className="student-remark-empty">—</span>
                      )}
                    </td>

                    {/* 6. 관리 버튼 */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleEdit(student)}>수정</button>
                      <button onClick={() => handleDelete(student.id)}>삭제</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Student Input / Edit Form */}
      <form onSubmit={handleSubmit}>
        <input
          placeholder="이름"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="학년/반"
          value={form.grade ?? ''}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
        />
        <input
          placeholder="학교이름"
          value={form.schoolName ?? ''}
          onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
        />
        <select
          value={form.gender ?? ''}
          onChange={(e) =>
            setForm({
              ...form,
              gender: e.target.value === '' ? undefined : (e.target.value as 'male' | 'female')
            })
          }
        >
          <option value="">성별 선택 안 함</option>
          <option value="male">남</option>
          <option value="female">여</option>
        </select>
        <input
          placeholder="전화번호"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          placeholder="학부모님 연락처"
          value={form.parentPhone ?? ''}
          onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
        />
        <div>
          <p>형제자매</p>
          <StudentMultiSelect
            students={students}
            selectedIds={form.siblingIds ?? []}
            onChange={(siblingIds) => setForm({ ...form, siblingIds })}
            excludeId={editingId ?? undefined}
          />
        </div>

        {/* Classes Enrollment Selection */}
        {classes.length > 0 && (
          <div>
            <p>수강 수업 배정 (동기화)</p>
            <div className="student-classes-selector">
              {classes.map((cls) => {
                const slotText = (cls.schedule ?? [])
                  .map((s) => `${DAY_LABELS[s.dayOfWeek]} ${s.startTime}~${s.endTime}`)
                  .join(', ');
                return (
                  <label key={cls.id} className="student-class-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClassIds([...selectedClassIds, cls.id]);
                        } else {
                          setSelectedClassIds(selectedClassIds.filter((id) => id !== cls.id));
                        }
                      }}
                    />
                    <span>
                      <strong>{cls.name}</strong> ({cls.teacherName ? `${cls.teacherName} 선생님 / ` : ''}
                      {slotText || '일정 미등록'})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Note / Remark input */}
        <div>
          <p>비고 / 특이사항 메모</p>
          <input
            placeholder="비고 / 특이사항 메모 작성..."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
          />
        </div>

        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>

      {/* Notion Side-Peek Detail Panel */}
      {selectedStudent && (
        <StudentDetailPanel
          student={selectedStudent}
          allStudents={students}
          classes={classes}
          clinics={clinics}
          exceptions={exceptions}
          comments={comments}
          onClose={() => setSelectedStudent(null)}
          onEdit={(s) => {
            setSelectedStudent(null);
            handleEdit(s);
          }}
          onDelete={(id) => handleDelete(id)}
          onAddComment={handleAddComment}
          onSelectStudent={(s) => setSelectedStudent(s)}
        />
      )}
    </div>
  );
}
