import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HandoverNotesPage } from '../src/pages/HandoverNotesPage';
import { handoverNotesApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  handoverNotesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('HandoverNotesPage', () => {
  it('lists existing notes', async () => {
    vi.mocked(handoverNotesApi.list).mockResolvedValue([
      {
        id: 'h1',
        date: '2026-09-15',
        author: '조교A',
        content: '내일 김민준 학생 보충 확인',
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<HandoverNotesPage />);

    expect(await screen.findByText(/내일 김민준 학생 보충 확인/)).toBeInTheDocument();
  });

  it('submits a new note and clears the content field but keeps the author', async () => {
    vi.mocked(handoverNotesApi.list).mockResolvedValue([]);
    vi.mocked(handoverNotesApi.create).mockResolvedValue({
      id: 'h1',
      date: '2026-09-15',
      author: '조교A',
      content: '숙제 다 못 낸 학생 있음',
      createdAt: '',
      updatedAt: ''
    });

    render(<HandoverNotesPage />);
    await screen.findByRole('button', { name: '추가' });

    await userEvent.type(screen.getByPlaceholderText('작성자'), '조교A');
    await userEvent.type(screen.getByPlaceholderText('내용'), '숙제 다 못 낸 학생 있음');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(handoverNotesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ author: '조교A', content: '숙제 다 못 낸 학생 있음' })
      )
    );

    expect(screen.getByPlaceholderText('내용')).toHaveValue('');
    expect(screen.getByPlaceholderText('작성자')).toHaveValue('조교A');
  });

  it('edits an existing note and submits the update instead of creating a new one', async () => {
    vi.mocked(handoverNotesApi.list).mockResolvedValue([
      {
        id: 'h1',
        date: '2026-09-15',
        author: '조교A',
        content: '내일 김민준 학생 보충 확인',
        createdAt: '',
        updatedAt: ''
      }
    ]);
    vi.mocked(handoverNotesApi.update).mockResolvedValue({
      id: 'h1',
      date: '2026-09-15',
      author: '조교A',
      content: '보충 완료로 수정',
      createdAt: '',
      updatedAt: ''
    });

    render(<HandoverNotesPage />);
    await screen.findByText(/내일 김민준 학생 보충 확인/);

    const createCallsBefore = vi.mocked(handoverNotesApi.create).mock.calls.length;

    await userEvent.click(screen.getByText('수정'));

    expect(screen.getByPlaceholderText('내용')).toHaveValue('내일 김민준 학생 보충 확인');
    expect(screen.getByPlaceholderText('작성자')).toHaveValue('조교A');

    await userEvent.clear(screen.getByPlaceholderText('내용'));
    await userEvent.type(screen.getByPlaceholderText('내용'), '보충 완료로 수정');
    await userEvent.click(screen.getByText('수정 완료'));

    await waitFor(() =>
      expect(handoverNotesApi.update).toHaveBeenCalledWith(
        'h1',
        expect.objectContaining({ author: '조교A', content: '보충 완료로 수정' })
      )
    );
    expect(handoverNotesApi.create).toHaveBeenCalledTimes(createCallsBefore);
  });
});
