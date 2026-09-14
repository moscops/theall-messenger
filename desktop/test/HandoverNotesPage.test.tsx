import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HandoverNotesPage } from '../src/pages/HandoverNotesPage';
import { handoverNotesApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  handoverNotesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('HandoverNotesPage', () => {
  it('lists existing notes, most recent date first', async () => {
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
  });
});
