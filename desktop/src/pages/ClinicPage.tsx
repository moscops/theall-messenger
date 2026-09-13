import { useCallback, useEffect, useState } from 'react';
import type { ClinicAssignment, ClinicAssignmentInput, Student } from '@theall/shared';
import { clinicsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

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

  const refresh = useCallback(() => {
    clinicsApi.list().then(setAssignments).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('clinics', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      await clinicsApi.update(editingId, form);
    } else {
      await clinicsApi.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
    refresh();
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
    await clinicsApi.remove(id);
    refresh();
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
                {assignment.dayOfWeek}요일 {assignment.startTime}-{assignment.endTime}
              </td>
              <td>
                <button onClick={() => handleEdit(assignment)}>수정</button>
                <button onClick={() => handleDelete(assignment.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
