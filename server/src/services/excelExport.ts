import ExcelJS from 'exceljs';
import type { CalendarEvent } from '@theall/shared';
import { CATEGORY_LABELS } from './calendarCategoryLabels.js';

export async function buildExcelBuffer(events: CalendarEvent[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('캘린더');
  sheet.columns = [
    { header: '날짜', key: 'date', width: 12 },
    { header: '학생명', key: 'studentName', width: 14 },
    { header: '분류', key: 'category', width: 12 },
    { header: '수업/클리닉', key: 'label', width: 16 },
    { header: '시작 시간', key: 'startTime', width: 10 },
    { header: '종료 시간', key: 'endTime', width: 10 }
  ];
  for (const event of events) {
    sheet.addRow({
      date: event.date,
      studentName: event.studentName,
      category: CATEGORY_LABELS[event.category],
      label: event.label,
      startTime: event.startTime,
      endTime: event.endTime
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
