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

async function createClass(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app)
    .post('/classes')
    .send({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
  return res.body.data.id;
}

describe('/exceptions', () => {
  it('creates and lists an exception, and broadcasts the change', async () => {
    const { app, broadcast } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const classId = await createClass(app);

    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: classId,
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
    const classId = await createClass(app);
    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: classId,
        exceptionType: 'reschedule',
        date: '2026-09-15'
      });
    expect(res.status).toBe(400);
  });

  it('rejects an exception whose targetId does not correspond to any real class', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: 'does-not-exist',
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a missing exception', async () => {
    const { app } = buildApp();
    const classId = await createClass(app);
    const res = await request(app)
      .patch('/exceptions/does-not-exist')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: classId,
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    expect(res.status).toBe(404);
  });

  it('deletes an exception', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const classId = await createClass(app);
    const createRes = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: classId,
        exceptionType: 'absence',
        date: '2026-09-15'
      });
    const deleteRes = await request(app).delete(`/exceptions/${createRes.body.data.id}`);
    expect(deleteRes.status).toBe(200);
  });

  it('accepts an exception with a classScheduleSlotId that belongs to the target class', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const classRes = await request(app)
      .post('/classes')
      .send({
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [
          { dayOfWeek: 2, startTime: '16:00', endTime: '17:30' },
          { dayOfWeek: 2, startTime: '18:00', endTime: '19:30' }
        ]
      });
    const classId = classRes.body.data.id;
    const slotId = classRes.body.data.schedule[0].id;

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'class',
        targetId: classId,
        classScheduleSlotId: slotId,
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.classScheduleSlotId).toBe(slotId);
  });

  it('rejects an exception whose classScheduleSlotId does not belong to the target class', async () => {
    const { app } = buildApp();
    const classId = await createClass(app);

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: 's1',
        targetType: 'class',
        targetId: classId,
        classScheduleSlotId: 'does-not-exist',
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(400);
  });

  it('rejects a classScheduleSlotId on a clinic-targeted exception', async () => {
    const { app } = buildApp();
    const studentRes = await request(app).post('/students').send({ name: '김민준' });
    const clinicRes = await request(app)
      .post('/clinics')
      .send({ studentId: studentRes.body.data.id, dayOfWeek: 2, startTime: '18:00', endTime: '19:00' });

    const res = await request(app)
      .post('/exceptions')
      .send({
        studentId: studentRes.body.data.id,
        targetType: 'clinic',
        targetId: clinicRes.body.data.id,
        classScheduleSlotId: 'some-slot',
        exceptionType: 'absence',
        date: '2026-09-15'
      });

    expect(res.status).toBe(400);
  });
});
