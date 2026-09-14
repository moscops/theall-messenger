import { describe, expect, it } from 'vitest';
import { buildPdfBuffer } from '../src/services/pdfExport.js';
import type { CalendarEvent } from '@theall/shared';

describe('buildPdfBuffer', () => {
  it('produces a non-empty PDF buffer for a non-empty event list', async () => {
    const events: CalendarEvent[] = [
      {
        date: '2026-09-15',
        studentId: 's1',
        studentName: '김민준',
        source: 'class',
        sourceId: 'c1',
        category: 'regular_class',
        label: '중2 수학',
        startTime: '16:00',
        endTime: '17:30'
      }
    ];

    const buffer = await buildPdfBuffer(events);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('produces a valid PDF buffer for an empty event list', async () => {
    const buffer = await buildPdfBuffer([]);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
