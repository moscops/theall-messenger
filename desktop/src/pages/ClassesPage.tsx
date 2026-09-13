import { useCallback, useEffect, useState } from 'react';
import type { Class, ClassInput, Student } from '@theall/shared';
import { classesApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { formatDayOfWeek } from '../dayOfWeek';
import { ScheduleSlotsEditor } from '../components/ScheduleSlotsEditor';
import { StudentMultiSelect } from '../components/StudentMultiSelect';

const emptyForm: ClassInput = {
  name: '',
  teacherName: '',
  schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }]
};

export function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<ClassInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    classesApi.list().then(setClasses).catch((error: unknown) => logger.error(error));
  }, []);

  const refreshStudents = useCallback(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(refreshStudents, [refreshStudents]);
  useLiveRefresh('classes', refresh);
  useLiveRefresh('students', refreshStudents);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await classesApi.update(editingId, form);
      } else {
        await classesApi.create(form);
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

  const handleEdit = (klass: Class) => {
    setEditingId(klass.id);
    setForm({
      name: klass.name,
      teacherName: klass.teacherName,
      schedule: klass.schedule.map(({ dayOfWeek, startTime, endTime }) => ({
        dayOfWeek,
        startTime,
        endTime
      })),
      studentIds: klass.studentIds
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await classesApi.remove(id);
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
      <h2>수업</h2>
      <table>
        <thead>
          <tr>
            <th>수업명</th>
            <th>담당 선생님</th>
            <th>요일/시간</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <tr key={klass.id}>
              <td>{klass.name}</td>
              <td>{klass.teacherName}</td>
              <td>
                {klass.schedule
                  .map((slot) => `${formatDayOfWeek(slot.dayOfWeek)} ${slot.startTime}-${slot.endTime}`)
                  .join(', ')}
              </td>
              <td>
                <button onClick={() => handleEdit(klass)}>수정</button>
                <button onClick={() => handleDelete(klass.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          placeholder="수업명"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="담당 선생님"
          value={form.teacherName}
          onChange={(e) => setForm({ ...form, teacherName: e.target.value })}
          required
        />
        <div>
          <p>요일/시간</p>
          <ScheduleSlotsEditor slots={form.schedule} onChange={(schedule) => setForm({ ...form, schedule })} />
        </div>
        <div>
          <p>수강생</p>
          <StudentMultiSelect
            students={students}
            selectedIds={form.studentIds ?? []}
            onChange={(studentIds) => setForm({ ...form, studentIds })}
          />
        </div>
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
