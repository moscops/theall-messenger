import { describe, expect, it } from 'vitest';
import { parseDateRange } from '../src/services/dateRange.js';

describe('parseDateRange', () => {
  it('accepts a valid range', () => {
    const result = parseDateRange('2026-09-01', '2026-09-07');
    expect(result).toEqual({ ok: true, from: '2026-09-01', to: '2026-09-07' });
  });

  it('rejects a missing from', () => {
    const result = parseDateRange(undefined, '2026-09-07');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = parseDateRange('2026/09/01', '2026-09-07');
    expect(result.ok).toBe(false);
  });

  it('rejects from after to', () => {
    const result = parseDateRange('2026-09-10', '2026-09-01');
    expect(result.ok).toBe(false);
  });

  it('rejects a range longer than 90 days', () => {
    const result = parseDateRange('2026-01-01', '2026-12-31');
    expect(result.ok).toBe(false);
  });

  it('accepts a range of exactly 90 days', () => {
    const result = parseDateRange('2026-01-01', '2026-04-01');
    expect(result.ok).toBe(true);
  });
});
