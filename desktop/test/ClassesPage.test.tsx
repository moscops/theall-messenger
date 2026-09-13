import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClassesPage } from '../src/pages/ClassesPage';
import { classesApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  classesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ClassesPage', () => {
  it('lists classes with their schedule', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([]);
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
    expect(screen.getByText('화요일 16:00-17:30')).toBeInTheDocument();
  });

  it('includes a picked student in the enrollment when creating a class', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '박서준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([]);
    vi.mocked(classesApi.create).mockResolvedValue({
      id: 'c1',
      name: '중3 영어',
      teacherName: '박선생',
      schedule: [{ id: 'sl1', dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
      studentIds: ['s1'],
      createdAt: '',
      updatedAt: ''
    });

    render(<ClassesPage />);
    await screen.findByText('박서준');

    await userEvent.type(screen.getByPlaceholderText('수업명'), '중3 영어');
    await userEvent.type(screen.getByPlaceholderText('담당 선생님'), '박선생');
    await userEvent.click(screen.getByRole('checkbox', { name: '박서준' }));
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(classesApi.create).toHaveBeenCalledWith({
        name: '중3 영어',
        teacherName: '박선생',
        schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
        studentIds: ['s1']
      })
    );
  });
});
