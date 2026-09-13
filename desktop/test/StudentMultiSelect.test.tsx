import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StudentMultiSelect } from '../src/components/StudentMultiSelect';

const students = [
  { id: '1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' },
  { id: '2', name: '이지은', siblingIds: [], createdAt: '', updatedAt: '' }
];

describe('StudentMultiSelect', () => {
  it('filters candidates by search text', async () => {
    render(<StudentMultiSelect students={students} selectedIds={[]} onChange={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText('학생 검색'), '김민');

    expect(screen.getByText('김민준')).toBeInTheDocument();
    expect(screen.queryByText('이지은')).not.toBeInTheDocument();
  });

  it('calls onChange with the id added when a candidate is checked', async () => {
    const onChange = vi.fn();
    render(<StudentMultiSelect students={students} selectedIds={[]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: '김민준' }));

    expect(onChange).toHaveBeenCalledWith(['1']);
  });

  it('calls onChange with the id removed when a selected candidate is unchecked', async () => {
    const onChange = vi.fn();
    render(<StudentMultiSelect students={students} selectedIds={['1']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: '김민준' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('excludes the given id from the candidate list', () => {
    render(<StudentMultiSelect students={students} selectedIds={[]} onChange={vi.fn()} excludeId="1" />);

    expect(screen.queryByText('김민준')).not.toBeInTheDocument();
    expect(screen.getByText('이지은')).toBeInTheDocument();
  });
});
