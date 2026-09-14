import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelBuffer } from '../src/services/excelExport.js';
import type { CalendarEvent } from '@theall/shared';

describe('buildExcelBuffer', () => {
  it('writes one row per event with the Korean category label', async () => {
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

    const buffer = await buildExcelBuffer(events);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('캘린더');
    expect(sheet?.rowCount).toBe(2); // header + 1 data row
    const row = sheet?.getRow(2).values as unknown[];
    expect(row).toContain('김민준');
    expect(row).toContain('정규수업');
  });
});
