import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studentsApi } from '../src/api/client';

describe('studentsApi', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ success: true, data: [{ id: '1', name: '김민준' }] })
      }))
    );
  });

  it('unwraps the ApiResponse envelope on list()', async () => {
    const students = await studentsApi.list();
    expect(students).toEqual([{ id: '1', name: '김민준' }]);
  });

  it('throws when the response is not successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ success: false, error: 'boom' }) }))
    );
    await expect(studentsApi.list()).rejects.toThrow('boom');
  });
});
