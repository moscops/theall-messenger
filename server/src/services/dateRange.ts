export interface ParsedDateRangeOk {
  ok: true;
  from: string;
  to: string;
}

export interface ParsedDateRangeError {
  ok: false;
  error: string;
}

export type ParsedDateRange = ParsedDateRangeOk | ParsedDateRangeError;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

export function parseDateRange(from: unknown, to: unknown): ParsedDateRange {
  if (typeof from !== 'string' || !DATE_PATTERN.test(from) || typeof to !== 'string' || !DATE_PATTERN.test(to)) {
    return { ok: false, error: 'from and to query params (YYYY-MM-DD) are required' };
  }
  if (from > to) {
    return { ok: false, error: 'from must not be after to' };
  }
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, error: `date range must not exceed ${MAX_RANGE_DAYS} days` };
  }
  return { ok: true, from, to };
}
