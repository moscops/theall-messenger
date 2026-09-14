import { useCallback, useEffect, useState } from 'react';
import type { HandoverNote, HandoverNoteInput } from '@theall/shared';
import { handoverNotesApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyForm(): HandoverNoteInput {
  return { date: today(), author: '', content: '' };
}

export function HandoverNotesPage() {
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [form, setForm] = useState<HandoverNoteInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    handoverNotesApi.list().then(setNotes).catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useLiveRefresh('handover', refresh);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await handoverNotesApi.create(form);
      setForm({ ...emptyForm(), author: form.author });
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
        {notes.map((note) => (
          <li key={note.id}>
            [{note.date}] {note.author}: {note.content}
            <button onClick={() => handleDelete(note.id)}>삭제</button>
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
        <button type="submit">추가</button>
      </form>
    </div>
  );
}
