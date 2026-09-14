import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WeeklySchedulePage } from '../src/pages/WeeklySchedulePage';
import { classesApi, clinicsApi, commentsApi, exceptionsApi, studentsApi } from '../src/api/client';
import type { Class, ClinicAssignment, Student } from '@theall/shared';

vi.mock('../src/api/client', () => ({
  classesApi: { list: vi.fn() },
  clinicsApi: { list: vi.fn() },
  studentsApi: { list: vi.fn() },
  exceptionsApi: { list: vi.fn() },
  commentsApi: { list: vi.fn(), create: vi.fn() }
}));

const mockStudents: Student[] = [
  { id: 's1', name: '김민수', siblingIds: [], createdAt: '', updatedAt: '' },
  { id: 's2', name: '이영희', siblingIds: [], createdAt: '', updatedAt: '' }
];

const mockClasses: Class[] = [
  {
    id: 'c1',
    name: '고1 심화수학',
    teacherName: '정선생',
    schedule: [{ id: 'slot1', dayOfWeek: 1, startTime: '17:00', endTime: '19:00' }],
    studentIds: ['s1'],
    createdAt: '',
    updatedAt: ''
  }
];

const mockClinics: ClinicAssignment[] = [
  {
    id: 'cl1',
    studentId: 's2',
    dayOfWeek: 2,
    startTime: '16:00',
    endTime: '17:00',
    createdAt: '',
    updatedAt: ''
  }
];

describe('WeeklySchedulePage', () => {
  beforeEach(() => {
    vi.mocked(studentsApi.list).mockResolvedValue(mockStudents);
    vi.mocked(classesApi.list).mockResolvedValue(mockClasses);
    vi.mocked(clinicsApi.list).mockResolvedValue(mockClinics);
    vi.mocked(exceptionsApi.list).mockResolvedValue([]);
    vi.mocked(commentsApi.list).mockResolvedValue([]);
  });

  it('renders weekly schedule and displays sessions in respective days', async () => {
    render(<WeeklySchedulePage />);

    expect(await screen.findByText('고1 심화수학')).toBeInTheDocument();
    expect(screen.getByText('이영희 클리닉')).toBeInTheDocument();
    expect(screen.getByText('김민수')).toBeInTheDocument();
  });

  it('filters by single day when day button is clicked', async () => {
    render(<WeeklySchedulePage />);

    await screen.findByText('고1 심화수학');

    // Click 화요일 tab
    await userEvent.click(screen.getByRole('button', { name: '화요일' }));

    // Monday class should no longer be visible
    expect(screen.queryByText('고1 심화수학')).not.toBeInTheDocument();
    // Tuesday clinic should still be visible
    expect(screen.getByText('이영희 클리닉')).toBeInTheDocument();
  });

  it('filters by type (classes only / clinics only)', async () => {
    render(<WeeklySchedulePage />);

    await screen.findByText('고1 심화수학');

    // Click '클리닉만'
    await userEvent.click(screen.getByRole('button', { name: /클리닉만/ }));
    expect(screen.queryByText('고1 심화수학')).not.toBeInTheDocument();
    expect(screen.getByText('이영희 클리닉')).toBeInTheDocument();

    // Click '수업만'
    await userEvent.click(screen.getByRole('button', { name: /수업만/ }));
    expect(screen.getByText('고1 심화수학')).toBeInTheDocument();
    expect(screen.queryByText('이영희 클리닉')).not.toBeInTheDocument();
  });

  it('opens student side-peek panel when student chip is clicked', async () => {
    render(<WeeklySchedulePage />);

    const studentChip = await screen.findByRole('button', { name: /김민수/ });
    await userEvent.click(studentChip);

    // Side peek panel should appear
    expect(await screen.findByText('학생 페이지')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '김민수' })).toBeInTheDocument();
  });
});
