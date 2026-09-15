import { useCallback, useEffect, useState } from 'react';
import type { HandoverNote, HandoverNoteInput } from '@theall/shared';
import { handoverNotesApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { todayLocal } from '../date';

function emptyForm(): HandoverNoteInput {
  return { date: todayLocal(), author: '', content: '' };
}

export function HandoverNotesPage() {
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [form, setForm] = useState<HandoverNoteInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    handoverNotesApi.list().then(setNotes).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('handover', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await handoverNotesApi.update(editingId, form);
      } else {
        await handoverNotesApi.create(form);
      }
      setForm(editingId ? emptyForm() : { ...emptyForm(), author: form.author });
      setEditingId(null);
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleEdit = (note: HandoverNote) => {
    setEditingId(note.id);
    setForm({ date: note.date, author: note.author, content: note.content });
  };

  const handleDelete = async (id: string) => {
    try {
      await handoverNotesApi.remove(id);
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
      <h2>인수인계 메모</h2>
      <ul>
        {notes.length === 0 && <li className="empty-state">아직 등록된 인수인계 메모가 없습니다.</li>}
        {notes.map((note) => (
          <li key={note.id}>
            [{note.date}] {note.author}: {note.content}
            <button className="btn-edit" onClick={() => handleEdit(note)}>
              수정
            </button>
            <button className="btn-delete" onClick={() => handleDelete(note.id)}>
              삭제
            </button>
          </li>
        ))}
      </ul>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <input
          placeholder="작성자"
          value={form.author}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
          required
        />
        <input
          placeholder="내용"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
        />
        <button type="submit">{editingId ? '수정 완료' : '추가'}</button>
      </form>
    </div>
  );
}
