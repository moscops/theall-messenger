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

describe('/clinics', () => {
  it('creates and lists a clinic assignment, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const createRes = await request(app)
      .post('/clinics')
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(createRes.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith('clinics');

    const listRes = await request(app).get('/clinics');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an invalid time format', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/clinics')
      .send({ studentId: 's1', dayOfWeek: 3, startTime: '6pm', endTime: '19:00' });
    expect(res.status).toBe(400);
  });

  it('updates a clinic assignment and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const createRes = await request(app)
      .post('/clinics')
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });

    const updateRes = await request(app)
      .patch(`/clinics/${createRes.body.data.id}`)
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 5, startTime: '19:00', endTime: '20:00' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.dayOfWeek).toBe(5);
    expect(updateRes.body.data.startTime).toBe('19:00');
    expect(broadcast).toHaveBeenCalledWith('clinics');
  });

  it('returns 404 when updating a missing clinic assignment', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .patch('/clinics/does-not-exist')
      .send({ studentId: 's1', dayOfWeek: 3, startTime: '18:00', endTime: '19:00' });
    expect(res.status).toBe(404);
  });
});
