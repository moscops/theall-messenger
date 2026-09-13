import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

    expect(await screen.findByText('김민준')).toBeInTheDocument();
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
});
