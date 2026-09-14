import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { generateStudentTemplateExcel, parseStudentsFromExcel } from '../src/services/studentExcelImport.js';

describe('studentExcelImport', () => {
  it('generates a valid student template excel buffer', async () => {
    const buffer = await generateStudentTemplateExcel();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe('학생등록양식');
    expect(sheet.rowCount).toBeGreaterThanOrEqual(3); // 1 header + 2 sample rows
  });

  it('parses student records from an excel buffer', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.columns = [
      { header: '이름', key: 'name' },
      { header: '학교', key: 'schoolName' },
      { header: '학년', key: 'grade' },
      { header: '성별', key: 'gender' },
      { header: '전화번호', key: 'phone' },
      { header: '학부모 연락처', key: 'parentPhone' }
    ];

    sheet.addRow({
      name: '홍길동',
      schoolName: '강남중',
      grade: '3학년',
      gender: '남',
      phone: '010-1111-2222',
      parentPhone: '010-3333-4444'
    });

    sheet.addRow({
      name: '김영희',
      schoolName: '서초고',
      grade: '2학년',
      gender: '여',
      phone: '010-5555-6666',
      parentPhone: '010-7777-8888'
    });

    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;
    const students = await parseStudentsFromExcel(Buffer.from(buffer));

    expect(students).toHaveLength(2);
    expect(students[0]).toEqual({
      name: '홍길동',
      schoolName: '강남중',
      grade: '3학년',
      gender: 'male',
      phone: '010-1111-2222',
      parentPhone: '010-3333-4444',
      siblingIds: []
    });
    expect(students[1].name).toBe('김영희');
    expect(students[1].gender).toBe('female');
  });
});
