import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import type { Broadcaster } from '../src/broadcast.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const db = createDb(':memory:');
    const broadcast: Broadcaster = vi.fn();
    const app = createApp(db, broadcast);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
