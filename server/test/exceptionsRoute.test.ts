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

describe('/exceptions', () => {
  it('creates and lists an exception, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('attendance');

    const listRes = await request(app).get('/exceptions');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a reschedule with no new time information', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'reschedule',
        date: '2026-09-15'
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a missing exception', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .patch('/exceptions/does-not-exist')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(res.status).toBe(404);
  });

  it('deletes an exception', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    const deleteRes = await request(app).delete(`/exceptions/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
  });
});
