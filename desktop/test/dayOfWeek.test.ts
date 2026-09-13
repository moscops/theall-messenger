import { describe, expect, it } from 'vitest';
import { formatDayOfWeek } from '../src/dayOfWeek';

describe('formatDayOfWeek', () => {
  it('formats a valid day index with its Korean label', () => {
    expect(formatDayOfWeek(0)).toBe('일요일');
    expect(formatDayOfWeek(2)).toBe('화요일');
    expect(formatDayOfWeek(6)).toBe('토요일');
  });
});
