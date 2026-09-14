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

describe('GET /export/pdf', () => {
  it('returns a PDF file', async () => {
    const { app } = buildApp();
    const res = await bufferedGet(app, '/export/pdf?from=2024-01-01&to=2024-01-01');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects a missing date range', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/export/pdf');
    expect(res.status).toBe(400);
  });

  it('returns a 500 ApiResponse instead of crashing when export generation fails', async () => {
    const pdfExportModule = await import('../src/services/pdfExport.js');
    const spy = vi.spyOn(pdfExportModule, 'buildPdfBuffer').mockRejectedValueOnce(new Error('boom'));
    try {
      const { app } = buildApp();
      const res = await request(app).get('/export/pdf?from=2024-01-01&to=2024-01-01');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
