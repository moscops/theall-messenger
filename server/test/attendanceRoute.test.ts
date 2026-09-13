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

describe('GET /attendance/roster', () => {
  it('returns the computed roster for the given date', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
        studentIds: [studentRes.body.data.id]
      });

    // 2024-01-01 is a Monday.
    const res = await request(app).get('/attendance/roster?date=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ studentId: studentRes.body.data.id, source: 'class', checkedIn: false })
    ]);
  });

  it('rejects a missing date query param', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/attendance/roster');
    expect(res.status).toBe(400);
  });
});
