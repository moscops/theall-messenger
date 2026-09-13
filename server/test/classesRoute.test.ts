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

describe('/classes', () => {
  it('creates and lists a class, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
      });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('classes');

    const listRes = await request(app).get('/classes');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a class with no schedule slots', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/classes')
      .send({ name: '중2 수학', teacherName: '김선생', schedule: [] });
    expect(res.status).toBe(400);
  });

  it('deletes a class', async () => {
    const { app } = buildApp();
    const createRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
      });
    const deleteRes = await request(app).delete(`/classes/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
  });
});
