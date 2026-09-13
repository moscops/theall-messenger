import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentsPage } from '../src/pages/StudentsPage';
import { studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn()
  }
}));

describe('StudentsPage', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists students returned from the API', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: '1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);

    render(<StudentsPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('김민준')).toBeInTheDocument();
  });

  it('submits the form to create a student', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([]);
    vi.mocked(studentsApi.create).mockResolvedValue({
      id: '2',
      name: '이지은',
      siblingIds: [],
      createdAt: '',
      updatedAt: ''
    });

    render(<StudentsPage />);
    await userEvent.type(screen.getByPlaceholderText('이름'), '이지은');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledWith({ name: '이지은' }));
  });

  it('submits gender, phone numbers, and a sibling selection', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '이지은', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(studentsApi.create).mockResolvedValue({
      id: 's2',
      name: '김민준',
      siblingIds: ['s1'],
      createdAt: '',
      updatedAt: ''
    });

    render(<StudentsPage />);
    await screen.findByRole('checkbox', { name: '이지은' });

    await userEvent.type(screen.getByPlaceholderText('이름'), '김민준');
    await userEvent.selectOptions(screen.getByRole('combobox'), '남');
    await userEvent.type(screen.getByPlaceholderText('전화번호'), '010-1111-2222');
    await userEvent.type(screen.getByPlaceholderText('학부모님 연락처'), '010-3333-4444');
    await userEvent.click(screen.getByRole('checkbox', { name: '이지은' }));
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(studentsApi.create).toHaveBeenCalledWith({
        name: '김민준',
        gender: 'male',
        phone: '010-1111-2222',
        parentPhone: '010-3333-4444',
        siblingIds: ['s1']
      })
    );
  });
});
