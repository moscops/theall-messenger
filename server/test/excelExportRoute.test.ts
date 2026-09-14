import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

function buildApp() {
  const db = createDb(':memory:');
  const broadcast: Broadcaster = vi.fn();
  return { app: createApp(db, broadcast) };
}

function bufferedGet(app: ReturnType<typeof createApp>, path: string) {
  return request(app)
    .get(path)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

describe('GET /export/excel', () => {
  it('returns an xlsx file containing one row per event', async () => {
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

    const res = await bufferedGet(app, '/export/excel?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    const sheet = workbook.getWorksheet('캘린더');
    expect(sheet?.rowCount).toBe(2);
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/export/excel');
    expect(res.status).toBe(400);
  });

  it('returns a 500 ApiResponse instead of crashing when export generation fails', async () => {
    const excelExportModule = await import('../src/services/excelExport.js');
    const spy = vi.spyOn(excelExportModule, 'buildExcelBuffer').mockRejectedValueOnce(new Error('boom'));
    try {
      const { app } = buildApp();
      const res = await request(app).get('/export/excel?from=2024-01-01&to=2024-01-01');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
