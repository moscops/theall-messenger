import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleSlotsEditor } from '../src/components/ScheduleSlotsEditor';

describe('ScheduleSlotsEditor', () => {
  it('adds a copy of the last slot when "시간대 추가" is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ScheduleSlotsEditor
        slots={[{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }]}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByText('시간대 추가'));

    expect(onChange).toHaveBeenCalledWith([
      { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
      { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }
    ]);
  });

  it('removes the clicked slot, keeping the rest', async () => {
    const onChange = vi.fn();
    render(
      <ScheduleSlotsEditor
        slots={[
          { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
          { dayOfWeek: 3, startTime: '18:00', endTime: '19:00' }
        ]}
        onChange={onChange}
      />
    );

    const removeButtons = screen.getAllByText('삭제');
    await userEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 3, startTime: '18:00', endTime: '19:00' }]);
  });

  it('does not offer a remove button when only one slot remains', () => {
    render(
      <ScheduleSlotsEditor slots={[{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }]} onChange={vi.fn()} />
    );

    expect(screen.queryByText('삭제')).not.toBeInTheDocument();
  });
});
