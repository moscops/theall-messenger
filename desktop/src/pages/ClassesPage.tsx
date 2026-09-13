import { useCallback, useEffect, useState } from 'react';
import type { Class, ClassInput } from '@theall/shared';
import { classesApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: ClassInput = {
  name: '',
  teacherName: '',
  schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }]
};

export function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [form, setForm] = useState<ClassInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    classesApi.list().then(setClasses).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('classes', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      await classesApi.update(editingId, form);
    } else {
      await classesApi.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
    refresh();
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
    await classesApi.remove(id);
    refresh();
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
                  .map((slot) => `${slot.dayOfWeek}요일 ${slot.startTime}-${slot.endTime}`)
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
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
