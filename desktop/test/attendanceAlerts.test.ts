import { describe, expect, it } from 'vitest';
import { findOverdueEntries } from '../src/attendanceAlerts';
import type { RosterEntry } from '@theall/shared';

const baseEntry: RosterEntry = {
  studentId: 's1',
  studentName: '김민준',
  source: 'class',
  sourceId: 'c1',
  label: '중2 수학',
  startTime: '16:00',
  endTime: '17:30',
  checkedIn: false
};

describe('findOverdueEntries', () => {
  it('flags an entry once the delay has passed and the student has not checked in', () => {
    const overdue = findOverdueEntries([baseEntry], 16 * 60 + 10, 5);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].key).toBe('s1:c1:16:00');
  });

  it('does not flag an entry before the delay has passed', () => {
    const overdue = findOverdueEntries([baseEntry], 16 * 60 + 3, 5);
    expect(overdue).toHaveLength(0);
  });

  it('does not flag a student who already checked in', () => {
    const checkedIn = { ...baseEntry, checkedIn: true, checkInTime: '16:02' };
    const overdue = findOverdueEntries([checkedIn], 16 * 60 + 20, 5);
    expect(overdue).toHaveLength(0);
  });
});
