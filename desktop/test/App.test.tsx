import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('App', () => {
  it('shows the students tab by default and switches to classes on click', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: '학생' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수업' }));
    expect(await screen.findByText('담당 선생님')).toBeInTheDocument();
  });
});
