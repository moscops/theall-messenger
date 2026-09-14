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

describe('/comments', () => {
  it('creates and lists a comment, and broadcasts on the comments topic', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/comments')
      .send({ studentId: studentRes.body.data.id, author: '조교', content: '오늘 집중을 잘함' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('comments');

    const listRes = await request(app).get('/comments');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an empty content field', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/comments')
      .send({ studentId: 's1', author: '조교', content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleting a missing comment', async () => {
    const { app } = buildApp();
    const res = await request(app).delete('/comments/does-not-exist');
    expect(res.status).toBe(404);
  });
});
