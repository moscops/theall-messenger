import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommentsPage } from '../src/pages/CommentsPage';
import { commentsApi, studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  commentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('CommentsPage', () => {
  it('lists existing comments with the student name resolved', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(commentsApi.list).mockResolvedValue([
      { id: 'c1', studentId: 's1', author: '조교', content: '오늘 집중을 잘함', createdAt: '', updatedAt: '' }
    ]);

    render(<CommentsPage />);

    expect(await screen.findByText(/오늘 집중을 잘함/)).toBeInTheDocument();
  });

  it('submits a new comment for the selected student', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(commentsApi.list).mockResolvedValue([]);
    vi.mocked(commentsApi.create).mockResolvedValue({
      id: 'c1',
      studentId: 's1',
      author: '조교',
      content: '숙제 다 해옴',
      createdAt: '',
      updatedAt: ''
    });

    render(<CommentsPage />);
    await screen.findAllByText('김민준');

    const studentSelects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(studentSelects[studentSelects.length - 1], 's1');
    await userEvent.type(screen.getByPlaceholderText('작성자'), '조교');
    await userEvent.type(screen.getByPlaceholderText('내용'), '숙제 다 해옴');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(commentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 's1', author: '조교', content: '숙제 다 해옴' })
      )
    );
  });
});
