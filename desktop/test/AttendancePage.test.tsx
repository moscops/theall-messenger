import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendancePage } from '../src/pages/AttendancePage';
import { attendanceApi, alertConfigApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  attendanceApi: { roster: vi.fn(), checkIn: vi.fn() },
  alertConfigApi: { get: vi.fn(), update: vi.fn() }
}));

describe('AttendancePage', () => {
  it("lists today's roster and checks a student in", async () => {
    vi.mocked(alertConfigApi.get).mockResolvedValue({ enabled: false, delayMinutes: 10 });
    vi.mocked(attendanceApi.roster).mockResolvedValue([
      {
        studentId: 's1',
        studentName: '김민준',
        source: 'class',
        sourceId: 'c1',
        label: '중2 수학',
        startTime: '16:00',
        endTime: '17:30',
        checkedIn: false
      }
    ]);
    vi.mocked(attendanceApi.checkIn).mockResolvedValue({
      id: 'a1',
      studentId: 's1',
      date: '2026-01-01',
      checkInTime: '16:01',
      createdAt: '',
      updatedAt: ''
    });

    render(<AttendancePage />);
    await screen.findByText('김민준');

    await userEvent.click(screen.getByText('체크인'));

    await waitFor(() => expect(attendanceApi.checkIn).toHaveBeenCalled());
    const [input] = vi.mocked(attendanceApi.checkIn).mock.calls[0];
    expect(input.studentId).toBe('s1');
    expect(input.checkInTime).toMatch(/^\d{2}:\d{2}$/);
  });
});
