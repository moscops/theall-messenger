import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast), broadcast };
}

describe('/handover-notes', () => {
  it('creates and lists a note, and broadcasts on the handover topic', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app)
      .post('/handover-notes')
      .send({ date: '2026-09-15', author: '조교A', content: '내일 김민준 학생 보충 확인' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('handover');

    const listRes = await request(app).get('/handover-notes');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an empty content field', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/handover-notes')
      .send({ date: '2026-09-15', author: '조교A', content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleting a missing note', async () => {
    const { app } = buildApp();
    const res = await request(app).delete('/handover-notes/does-not-exist');
    expect(res.status).toBe(404);
  });
});
