import { useCallback, useEffect, useState } from 'react';
import type { Class, ClinicAssignment, ScheduleException, Student, StudentComment, StudentInput } from '@theall/shared';
import * as clientModule from '../api/client';
import { studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { StudentMultiSelect } from '../components/StudentMultiSelect';
import { StudentDetailPanel } from '../components/StudentDetailPanel';

const emptyForm: StudentInput = { name: '' };

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [comments, setComments] = useState<StudentComment[]>([]);

  const [form, setForm] = useState<StudentInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  const refreshStudents = useCallback(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await studentsApi.update(editingId, form);
      } else {
        await studentsApi.create(form);
      }
      setForm(emptyForm);
      setEditingId(null);
      setError(null);
      refreshStudents();
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

  const filteredStudents = students.filter(
    (s) =>
      s.name.includes(searchTerm) ||
      (s.schoolName && s.schoolName.includes(searchTerm)) ||
      (s.grade && s.grade.includes(searchTerm))
  );

  return (
    <div className="notion-page">
      <div className="notion-page-header">
        <h2>학생</h2>
        <div className="notion-header-actions">
          <input
            type="text"
            className="notion-search-input"
            placeholder="학생 필터 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="button"
            className="notion-primary-btn"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setIsFormOpen(!isFormOpen);
            }}
          >
            {isFormOpen ? '폼 닫기' : '+ 학생 등록'}
          </button>
        </div>
      </div>

      <p className="notion-hint-text">💡 학생 이름을 클릭하면 우측에서 상세 인적사항, 수강 수업, 코멘트를 확인할 수 있습니다.</p>

      {/* Notion Database Table */}
      <div className="notion-table-container">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>학년/반</th>
              <th>학교</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr
                key={student.id}
                className={`notion-clickable-row ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                onClick={() => setSelectedStudent(student)}
              >
                <td>
                  <span className="notion-row-title">
                    <span className="row-icon">🎓</span> {student.name}
                  </span>
                </td>
                <td>{student.grade ?? ''}</td>
                <td>{student.schoolName ?? ''}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleEdit(student)}>수정</button>
                  <button onClick={() => handleDelete(student.id)}>삭제</button>
                </td>
              </tr>
            ))}
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
