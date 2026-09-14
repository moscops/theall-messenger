import { useCallback, useEffect, useState } from 'react';
import type { Student, StudentComment, StudentCommentInput } from '@theall/shared';
import { commentsApi, studentsApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

const emptyForm: StudentCommentInput = { studentId: '', author: '', content: '' };

export function CommentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [comments, setComments] = useState<StudentComment[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [form, setForm] = useState<StudentCommentInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    commentsApi.list().then(setComments).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    studentsApi.list().then(setStudents).catch((error: unknown) => logger.error(error));
  }, []);
  useLiveRefresh('comments', refresh);

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  const visibleComments = selectedStudentId
    ? comments.filter((comment) => comment.studentId === selectedStudentId)
    : comments;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await commentsApi.create(form);
      setForm({ ...emptyForm, studentId: form.studentId });
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
      await commentsApi.remove(id);
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
      <h2>학생 코멘트</h2>
      <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
        <option value="">전체 학생</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name}
          </option>
        ))}
      </select>
      <ul>
        {visibleComments.map((comment) => (
          <li key={comment.id}>
            [{studentName(comment.studentId)}] {comment.date ? `${comment.date} ` : ''}
            {comment.author}: {comment.content}
            <button onClick={() => handleDelete(comment.id)}>삭제</button>
          </li>
        ))}
      </ul>
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
        <input
          placeholder="작성자"
          value={form.author}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
          required
        />
        <input type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input
          placeholder="내용"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
        />
        <button type="submit">추가</button>
      </form>
    </div>
  );
}
