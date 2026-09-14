import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

describe('Students Export and Import Routes', () => {
  it('GET /export/excel/students returns xlsx buffer', async () => {
    const db = createDb(':memory:');
    const app = createApp(db, () => {});

    // Create a student
    db.prepare(
      'INSERT INTO students (id, name, school_name, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('s1', '김민수', '신사중', '2학년', '2026-01-01', '2026-01-01');

    const res = await request(app).get('/export/excel/students');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('theall-students-');
  });

  it('GET /export/pdf/students returns pdf buffer', async () => {
    const db = createDb(':memory:');
    const app = createApp(db, () => {});

    db.prepare(
      'INSERT INTO students (id, name, school_name, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('s1', '김민수', '신사중', '2학년', '2026-01-01', '2026-01-01');

    const res = await request(app).get('/export/pdf/students');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('theall-students-');
  });

  it('GET /students/template returns excel template', async () => {
    const db = createDb(':memory:');
    const app = createApp(db, () => {});

    const res = await request(app).get('/students/template');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('theall-student-template.xlsx');
  });

  it('POST /students/batch creates multiple students at once', async () => {
    const db = createDb(':memory:');
    const app = createApp(db, () => {});

    const res = await request(app)
      .post('/students/batch')
      .send({
        students: [
          { name: '학생1', schoolName: '학교A', grade: '1학년' },
          { name: '학생2', schoolName: '학교B', grade: '2학년' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.students).toHaveLength(2);
  });
});
