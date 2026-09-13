import { useCallback, useEffect, useState } from 'react';
import type { ClinicAssignment, ClinicAssignmentInput, Student } from '@theall/shared';
import { clinicsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { DAY_LABELS, formatDayOfWeek } from '../dayOfWeek';

const emptyForm: ClinicAssignmentInput = {
  studentId: '',
  dayOfWeek: 1,
  startTime: '18:00',
  endTime: '19:00'
};

export function ClinicPage() {
  const [assignments, setAssignments] = useState<ClinicAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<ClinicAssignmentInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    clinicsApi.list().then(setAssignments).catch((error: unknown) => logger.error(error));
  }, []);

  const refreshStudents = useCallback(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(refreshStudents, [refreshStudents]);
  useLiveRefresh('clinics', refresh);
  useLiveRefresh('students', refreshStudents);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await clinicsApi.update(editingId, form);
      } else {
        await clinicsApi.create(form);
      }
      setForm(emptyForm);
      setEditingId(null);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleEdit = (assignment: ClinicAssignment) => {
    setEditingId(assignment.id);
    setForm({
      studentId: assignment.studentId,
      dayOfWeek: assignment.dayOfWeek,
      startTime: assignment.startTime,
      endTime: assignment.endTime
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await clinicsApi.remove(id);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <h2>클리닉</h2>
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>요일/시간</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td>{studentName(assignment.studentId)}</td>
              <td>
                {formatDayOfWeek(assignment.dayOfWeek)} {assignment.startTime}-{assignment.endTime}
              </td>
              <td>
                <button onClick={() => handleEdit(assignment)}>수정</button>
                <button onClick={() => handleDelete(assignment.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <select
          value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          required
        >
          <option value="">학생 선택</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <select
          value={form.dayOfWeek}
          onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
        >
          {DAY_LABELS.map((label, day) => (
            <option key={day} value={day}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
        />
        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
        />
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
