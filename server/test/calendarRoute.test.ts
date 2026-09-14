import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast) };
}

describe('GET /calendar', () => {
  it('returns computed events for the given range', async () => {
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

    const res = await request(app).get('/calendar?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ studentId: studentRes.body.data.id, category: 'regular_class' })
    ]);
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/calendar');
    expect(res.status).toBe(400);
  });

  it('rejects a range longer than 90 days', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/calendar?from=2024-01-01&to=2024-12-31');
    expect(res.status).toBe(400);
  });
});
