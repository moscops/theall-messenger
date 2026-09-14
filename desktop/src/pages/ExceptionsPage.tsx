import { useCallback, useEffect, useState } from 'react';
import type {
  Class,
  ClinicAssignment,
  ScheduleException,
  ScheduleExceptionInput,
  Student
} from '@theall/shared';
import { classesApi, clinicsApi, exceptionsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: ScheduleExceptionInput = {
  studentId: '',
  targetType: 'class',
  targetId: '',
  exceptionType: 'absence',
  date: ''
};

const EXCEPTION_TYPE_LABELS: Record<ScheduleExceptionInput['exceptionType'], string> = {
  absence: '결석',
  reschedule: '시간변경',
  makeup: '보충추가'
};

export function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [clinics, setClinics] = useState<ClinicAssignment[]>([]);
  const [form, setForm] = useState<ScheduleExceptionInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    exceptionsApi.list().then(setExceptions).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
    classesApi.list().then(setClasses).catch((error: unknown) => logger.error(error));
    clinicsApi.list().then(setClinics).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('attendance', refresh);

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  const targetLabel = (targetType: string, targetId: string) => {
    if (targetType === 'class') {
      return classes.find((c) => c.id === targetId)?.name ?? targetId;
    }
    const clinic = clinics.find((c) => c.id === targetId);
    return clinic ? `클리닉(${studentName(clinic.studentId)})` : targetId;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await exceptionsApi.create(form);
      setForm(emptyForm);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await exceptionsApi.remove(id);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const targetOptions: Array<Class | ClinicAssignment> = form.targetType === 'class' ? classes : clinics;
  const needsNewTime = form.exceptionType === 'reschedule' || form.exceptionType === 'makeup';

  return (
    <div>
      <h2>일정 예외</h2>
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>대상</th>
            <th>유형</th>
            <th>날짜</th>
            <th>사유</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((exception) => (
            <tr key={exception.id}>
              <td>{studentName(exception.studentId)}</td>
              <td>{targetLabel(exception.targetType, exception.targetId)}</td>
              <td>{EXCEPTION_TYPE_LABELS[exception.exceptionType]}</td>
              <td>{exception.date}</td>
              <td>{exception.reason}</td>
              <td>
                <button onClick={() => handleDelete(exception.id)}>삭제</button>
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
          value={form.targetType}
          onChange={(e) =>
            setForm({ ...form, targetType: e.target.value as ScheduleExceptionInput['targetType'], targetId: '' })
          }
        >
          <option value="class">수업</option>
          <option value="clinic">클리닉</option>
        </select>
        <select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} required>
          <option value="">대상 선택</option>
          {targetOptions.map((target) => (
            <option key={target.id} value={target.id}>
              {form.targetType === 'class'
                ? (target as Class).name
                : `클리닉(${studentName((target as ClinicAssignment).studentId)})`}
            </option>
          ))}
        </select>
        <select
          value={form.exceptionType}
          onChange={(e) =>
            setForm({
              ...form,
              exceptionType: e.target.value as ScheduleExceptionInput['exceptionType'],
              newDate: undefined,
              newStartTime: undefined,
              newEndTime: undefined
            })
          }
        >
          <option value="absence">결석</option>
          <option value="reschedule">시간변경</option>
          <option value="makeup">보충추가</option>
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <input
          placeholder="사유"
          value={form.reason ?? ''}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        {needsNewTime && (
          <>
            {form.exceptionType === 'reschedule' && (
              <input
                type="date"
                value={form.newDate ?? ''}
                onChange={(e) => setForm({ ...form, newDate: e.target.value })}
                required
              />
            )}
            <input
              type="time"
              value={form.newStartTime ?? ''}
              onChange={(e) => setForm({ ...form, newStartTime: e.target.value })}
              required
            />
            <input
              type="time"
              value={form.newEndTime ?? ''}
              onChange={(e) => setForm({ ...form, newEndTime: e.target.value })}
              required
            />
          </>
        )}
        <button type="submit">추가</button>
      </form>
    </div>
  );
}
