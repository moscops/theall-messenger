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

describe('POST /attendance/check-in', () => {
  it('creates a check-in and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });

    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: studentRes.body.data.id, date: '2026-09-15', checkInTime: '09:05' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkInTime).toBe('09:05');
    expect(broadcast).toHaveBeenCalledWith('attendance');
  });

  it('rejects a malformed date', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/attendance/check-in')
      .send({ studentId: 's1', date: 'not-a-date', checkInTime: '09:05' });
    expect(res.status).toBe(400);
  });
});
