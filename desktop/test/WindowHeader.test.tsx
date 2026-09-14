import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WindowHeader } from '../src/components/WindowHeader';

describe('WindowHeader', () => {
  it('renders title and active tab', () => {
    render(<WindowHeader title="TheAll Messenger" activeTabTitle="학생 관리" />);
    expect(screen.getByText('TheAll Messenger')).toBeInTheDocument();
    expect(screen.getByText('학생 관리')).toBeInTheDocument();
  });

  it('renders minimize, maximize, and close buttons and triggers electron API if available', async () => {
    const mockMinimize = vi.fn();
    const mockMaximize = vi.fn();
    const mockClose = vi.fn();
    const mockIsMaximized = vi.fn().mockResolvedValue(false);

    window.electronAPI = {
      minimize: mockMinimize,
      maximize: mockMaximize,
      close: mockClose,
      isMaximized: mockIsMaximized
    };

    render(<WindowHeader title="TheAll Messenger" activeTabTitle="수업일정" />);

    const closeBtns = screen.getAllByLabelText('창 닫기');
    const minBtns = screen.getAllByLabelText('창 최소화');
    const maxBtns = screen.getAllByLabelText('창 최대화');

    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
    expect(minBtns.length).toBeGreaterThanOrEqual(1);
    expect(maxBtns.length).toBeGreaterThanOrEqual(1);

    await userEvent.click(closeBtns[0]);
    expect(mockClose).toHaveBeenCalled();

    await userEvent.click(minBtns[0]);
    expect(mockMinimize).toHaveBeenCalled();

    await userEvent.click(maxBtns[0]);
    expect(mockMaximize).toHaveBeenCalled();

    delete window.electronAPI;
  });
});
