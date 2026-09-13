import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClassesPage } from '../src/pages/ClassesPage';
import { classesApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  classesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ClassesPage', () => {
  it('lists classes with their schedule', async () => {
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: '1',
        name: '중2 수학',
        teacherName: '김선생',
        schedule: [{ id: 's1', dayOfWeek: 2, startTime: '16:00', endTime: '17:30' }],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<ClassesPage />);

    expect(await screen.findByText('중2 수학')).toBeInTheDocument();
    expect(screen.getByText('2요일 16:00-17:30')).toBeInTheDocument();
  });
});
