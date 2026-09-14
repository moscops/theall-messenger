import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studentsApi, classesApi, clinicsApi, attendanceApi, alertConfigApi, exceptionsApi, commentsApi, handoverNotesApi } from '../src/api/client';

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

describe('attendanceApi', () => {
  it('requests the roster for a date via the query string', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: [] });

    await attendanceApi.roster('2026-09-15');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/roster?date=2026-09-15',
      expect.objectContaining({})
    );
  });

  it('sends a POST with the correct body on checkIn()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'a1' } });

    await attendanceApi.checkIn({ studentId: 's1', date: '2026-09-15', checkInTime: '09:05' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/check-in',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      studentId: 's1',
      date: '2026-09-15',
      checkInTime: '09:05'
    });
  });
});

describe('alertConfigApi', () => {
  it('sends a PUT with the correct body on update()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { enabled: true, delayMinutes: 15 } });

    await alertConfigApi.update({ enabled: true, delayMinutes: 15 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/attendance/alert-config',
      expect.objectContaining({ method: 'PUT' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ enabled: true, delayMinutes: 15 });
  });
});

describe('exceptionsApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'e1' } });

    await exceptionsApi.create({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/exceptions',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('commentsApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'c1' } });

    await commentsApi.create({ studentId: 's1', author: '조교', content: '내용' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/comments',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('handoverNotesApi', () => {
  it('sends a POST with the correct body on create()', async () => {
    const fetchMock = mockFetchOnce({ success: true, data: { id: 'h1' } });

    await handoverNotesApi.create({ date: '2026-09-15', author: '조교A', content: '내용' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/handover-notes',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
