import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClinicPage } from '../src/pages/ClinicPage';
import { clinicsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  clinicsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ClinicPage', () => {
  it('shows the assigned student name instead of a raw id', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([
      { id: 'c1', studentId: 's1', dayOfWeek: 3, startTime: '18:00', endTime: '19:00', createdAt: '', updatedAt: '' }
    ]);

    render(<ClinicPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('김민준')).toBeInTheDocument();
  });

  it('lets the user pick a day, start time, and end time before creating an assignment', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(clinicsApi.create).mockResolvedValue({
      id: 'c1',
      studentId: 's1',
      dayOfWeek: 3,
      startTime: '17:00',
      endTime: '18:00',
      createdAt: '',
      updatedAt: ''
    });

    render(<ClinicPage />);
    await screen.findByText('김민준');

    const [studentSelect, daySelect] = screen.getAllByRole('combobox');
    await userEvent.selectOptions(studentSelect, 's1');
    await userEvent.selectOptions(daySelect, '수');
    const [startInput, endInput] = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/);
    fireEvent.change(startInput, { target: { value: '17:00' } });
    fireEvent.change(endInput, { target: { value: '18:00' } });
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(clinicsApi.create).toHaveBeenCalledWith({
        studentId: 's1',
        dayOfWeek: 3,
        startTime: '17:00',
        endTime: '18:00'
      })
    );
  });
});
