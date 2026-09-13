import { render, screen, within } from '@testing-library/react';
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
});
