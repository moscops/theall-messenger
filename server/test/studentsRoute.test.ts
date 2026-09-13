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

describe('/students', () => {
  it('creates and lists a student, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();

    const createRes = await request(app).post('/students').send({ name: '김민준' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.name).toBe('김민준');
    expect(broadcast).toHaveBeenCalledWith('students');

    const listRes = await request(app).get('/students');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects a student with no name', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/students').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when updating a missing student', async () => {
    const { app } = buildApp();
    const res = await request(app).patch('/students/does-not-exist').send({ name: '이지은' });
    expect(res.status).toBe(404);
  });

  it('deletes a student', async () => {
    const { app } = buildApp();
    const createRes = await request(app).post('/students').send({ name: '김민준' });
    const deleteRes = await request(app).delete(`/students/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
    const listRes = await request(app).get('/students');
    expect(listRes.body.data).toHaveLength(0);
  });
});
