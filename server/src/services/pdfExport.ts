import PDFDocument from 'pdfkit';
import { loadNotoSansKRRegular } from '@reogrid/font-kr';
import type { CalendarEvent } from '@theall/shared';
import { CATEGORY_LABELS } from './calendarCategoryLabels.js';

export async function buildPdfBuffer(events: CalendarEvent[]): Promise<Buffer> {
  const fontBytes = await loadNotoSansKRRegular();
  const doc = new PDFDocument({ margin: 40 });
  doc.registerFont('NotoSansKR', Buffer.from(fontBytes));
  doc.font('NotoSansKR');

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(16).text('캘린더', { align: 'center' });
  doc.moveDown();

  for (const event of events) {
    doc
      .fontSize(10)
      .text(
        `${event.date}  ${event.studentName}  [${CATEGORY_LABELS[event.category]}]  ${event.label}  ${event.startTime}-${event.endTime}`
      );
  }

  doc.end();
  return finished;
}
