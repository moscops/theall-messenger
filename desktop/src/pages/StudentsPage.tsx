import { useCallback, useEffect, useState } from 'react';
import type { Student, StudentInput } from '@theall/shared';
import { studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { StudentMultiSelect } from '../components/StudentMultiSelect';

const emptyForm: StudentInput = { name: '' };

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<StudentInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('students', refresh);

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
      refresh();
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
  };

  const handleDelete = async (id: string) => {
    try {
      await studentsApi.remove(id);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  return (
    <div>
      <h2>학생</h2>
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
          {students.map((student) => (
            <tr key={student.id}>
              <td>{student.name}</td>
              <td>{student.grade}</td>
              <td>{student.schoolName}</td>
              <td>
                <button onClick={() => handleEdit(student)}>수정</button>
                <button onClick={() => handleDelete(student.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p style={{ color: 'red' }}>{error}</p>}
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
    </div>
  );
}
