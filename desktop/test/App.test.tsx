import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

vi.mock('../src/api/client', () => ({
  studentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  classesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  clinicsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  attendanceApi: { roster: vi.fn().mockResolvedValue([]), checkIn: vi.fn() },
  alertConfigApi: { get: vi.fn().mockResolvedValue({ enabled: false, delayMinutes: 10 }), update: vi.fn() },
  exceptionsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  commentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  handoverNotesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

describe('App', () => {
  it('shows the students tab by default and switches to classes on click', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: '학생' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수업' }));
    expect(await screen.findByText('담당 선생님')).toBeInTheDocument();
  });

  it('switches to the attendance, exceptions, and comments tabs', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '출결' }));
    expect(await screen.findByRole('heading', { name: /출결/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '일정 예외' }));
    expect(await screen.findByRole('heading', { name: '일정 예외' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '코멘트' }));
    expect(await screen.findByRole('heading', { name: '학생 코멘트' })).toBeInTheDocument();
  });

  it('switches to the handover notes tab', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '인수인계' }));
    expect(await screen.findByRole('heading', { name: '인수인계 메모' })).toBeInTheDocument();
  });

  it('switches to the schedule (수업일정) tab', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '수업일정' }));
    expect(await screen.findByRole('heading', { name: '수업일정' })).toBeInTheDocument();
  });

  it('renders custom window titlebar with minimize, maximize, close buttons and sidebar resizer', async () => {
    render(<App />);

    expect(screen.getByTestId('notion-titlebar')).toBeInTheDocument();
    expect(screen.getAllByLabelText('창 닫기').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('창 최소화').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('창 최대화').length).toBeGreaterThanOrEqual(1);

    const resizer = screen.getByRole('separator');
    expect(resizer).toHaveClass('sidebar-resizer');
  });
});
