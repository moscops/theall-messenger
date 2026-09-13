import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studentsApi, classesApi, clinicsApi } from '../src/api/client';

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    json: async () => body
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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

  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '이지은' } });

    await studentsApi.create({ name: '이지은' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: '이지은' });
  });

  it('sends a PATCH with the correct URL, method, and body on update()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '이지은(수정)' } });

    await studentsApi.update('1', { name: '이지은(수정)' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students/1',
      expect.objectContaining({ method: 'PATCH' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: '이지은(수정)' });
  });

  it('sends a DELETE to the correct URL on remove()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: null });

    await studentsApi.remove('1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/students/1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('classesApi', () => {
  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', name: '중2 수학' } });

    await classesApi.create({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/classes',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      name: '중2 수학',
      teacherName: '김선생',
      schedule: [{ dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }]
    });
  });
});

describe('clinicsApi', () => {
  it('sends a POST with the correct URL, method, and body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: '1', studentId: 's1' } });

    await clinicsApi.create({
      studentId: 's1',
      dayOfWeek: 3,
      startTime: '18:00',
      endTime: '19:00'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/clinics',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      studentId: 's1',
      dayOfWeek: 3,
      startTime: '18:00',
      endTime: '19:00'
    });
  });
});
