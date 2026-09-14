import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsPage } from '../src/pages/ExceptionsPage';
import { classesApi, clinicsApi, exceptionsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  exceptionsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('ExceptionsPage', () => {
  it('shows the class name instead of a raw target id', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([
      {
        id: 'e1',
        studentId: 's1',
        targetType: 'class',
        targetId: 'c1',
        exceptionType: 'absence',
        date: '2026-09-15',
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<ExceptionsPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('중2 수학')).toBeInTheDocument();
    expect(within(table).getByText('결석')).toBeInTheDocument();
  });

  it('requires new date and time fields for a reschedule before submitting', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.create).mockResolvedValue({
      id: 'e1',
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30',
      createdAt: '',
      updatedAt: ''
    });

    render(<ExceptionsPage />);
    await screen.findByText('중2 수학');

    await userEvent.selectOptions(screen.getByDisplayValue('학생 선택'), 's1');
    await userEvent.selectOptions(screen.getByDisplayValue('대상 선택'), 'c1');
    await userEvent.selectOptions(screen.getByDisplayValue('결석'), '시간변경');

    const dateInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'date');
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-15' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-09-17' } });
    const timeInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'time');
    fireEvent.change(timeInputs[0], { target: { value: '17:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '18:30' } });

    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(exceptionsApi.create).toHaveBeenCalled());
    const [input] = vi.mocked(exceptionsApi.create).mock.calls[0];
    expect(input).toMatchObject({
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'reschedule',
      date: '2026-09-15',
      newDate: '2026-09-17',
      newStartTime: '17:00',
      newEndTime: '18:30'
    });
  });

  it('clears stale reschedule fields when switching exception type back to absence', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.create).mockResolvedValue({
      id: 'e1',
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      exceptionType: 'absence',
      date: '2026-09-15',
      createdAt: '',
      updatedAt: ''
    });

    render(<ExceptionsPage />);
    await screen.findByText('중2 수학');

    await userEvent.selectOptions(screen.getByDisplayValue('학생 선택'), 's1');
    await userEvent.selectOptions(screen.getByDisplayValue('대상 선택'), 'c1');
    await userEvent.selectOptions(screen.getByDisplayValue('결석'), '시간변경');

    const dateInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'date');
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-15' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-09-17' } });
    const timeInputs = screen.getAllByDisplayValue('').filter((el) => el.getAttribute('type') === 'time');
    fireEvent.change(timeInputs[0], { target: { value: '17:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '18:30' } });

    await userEvent.selectOptions(screen.getByDisplayValue('시간변경'), '결석');

    const createCallsBefore = vi.mocked(exceptionsApi.create).mock.calls.length;
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(exceptionsApi.create).toHaveBeenCalledTimes(createCallsBefore + 1));
    const [input] = vi.mocked(exceptionsApi.create).mock.calls[createCallsBefore];
    expect(input.newDate).toBeUndefined();
    expect(input.newStartTime).toBeUndefined();
    expect(input.newEndTime).toBeUndefined();
  });

  it('shows a slot picker only for a class with more than one schedule slot, and includes the chosen slot id on submit', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(classesApi.list).mockResolvedValue([
      {
        id: 'c1',
        name: '중2 수학',
        teacherName: '박선생',
        schedule: [
          { id: 'slot1', dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
          { id: 'slot2', dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }
        ],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'c2',
        name: '중3 영어',
        teacherName: '이선생',
        schedule: [{ id: 'slot3', dayOfWeek: 2, startTime: '17:00', endTime: '18:00' }],
        studentIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(clinicsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.list).mockResolvedValue([]);
    vi.mocked(exceptionsApi.create).mockResolvedValue({
      id: 'e1',
      studentId: 's1',
      targetType: 'class',
      targetId: 'c1',
      classScheduleSlotId: 'slot1',
      exceptionType: 'absence',
      date: '2026-09-15',
      createdAt: '',
      updatedAt: ''
    });

    render(<ExceptionsPage />);
    await screen.findByText('중2 수학');

    await userEvent.selectOptions(screen.getByDisplayValue('학생 선택'), 's1');

    // Single-slot class: no slot picker.
    const targetSelect = screen.getByDisplayValue('대상 선택');
    await userEvent.selectOptions(targetSelect, 'c2');
    expect(screen.queryByText('전체 시간대')).not.toBeInTheDocument();

    // Multi-slot class: slot picker appears.
    await userEvent.selectOptions(targetSelect, 'c1');
    const slotSelect = screen.getByDisplayValue('전체 시간대');
    await userEvent.selectOptions(slotSelect, 'slot1');

    const dateInput = screen.getAllByDisplayValue('').find((el) => el.getAttribute('type') === 'date');
    fireEvent.change(dateInput!, { target: { value: '2026-09-15' } });

    const createCallsBefore = vi.mocked(exceptionsApi.create).mock.calls.length;
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(exceptionsApi.create).toHaveBeenCalledTimes(createCallsBefore + 1));
    const [input] = vi.mocked(exceptionsApi.create).mock.calls[createCallsBefore];
    expect(input).toMatchObject({ targetId: 'c1', classScheduleSlotId: 'slot1' });
  });
});
