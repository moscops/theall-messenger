import ExcelJS from 'exceljs';
import type { StudentInput } from '@theall/shared';

function extractCellValue(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'object') {
    if ('text' in cellValue && typeof (cellValue as { text: unknown }).text === 'string') {
      return (cellValue as { text: string }).text.trim();
    }
    if ('result' in cellValue) {
      return String((cellValue as { result: unknown }).result ?? '').trim();
    }
  }
  return String(cellValue).trim();
}

function parseGender(val: string): 'male' | 'female' | undefined {
  const clean = val.toLowerCase().trim();
  if (['남', '남자', '남학생', 'm', 'male'].includes(clean)) return 'male';
  if (['여', '여자', '여학생', 'f', 'female'].includes(clean)) return 'female';
  return undefined;
}

export async function parseStudentsFromExcel(buffer: Buffer): Promise<StudentInput[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('워크시트를 찾을 수 없습니다.');
  }

  // Find column indexes from header row (row 1)
  const headerRow = worksheet.getRow(1);
  const colMap: {
    name?: number;
    schoolName?: number;
    grade?: number;
    gender?: number;
    phone?: number;
    parentPhone?: number;
  } = {};

  headerRow.eachCell((cell, colNumber) => {
    const raw = extractCellValue(cell.value).toLowerCase().replace(/\s+/g, '');
    if (['이름', '학생이름', '성명', '학생명', 'name', '이름(필수)'].some((k) => raw.includes(k))) {
      colMap.name = colNumber;
    } else if (['학교', '학교명', '학교이름', '소속학교', 'school'].some((k) => raw.includes(k))) {
      colMap.schoolName = colNumber;
    } else if (['학년', '학년/반', '반', 'grade'].some((k) => raw.includes(k))) {
      colMap.grade = colNumber;
    } else if (['성별', '성', 'gender'].some((k) => raw.includes(k))) {
      colMap.gender = colNumber;
    } else if (
      ['전화번호', '학생전화', '연락처', '학생연락처', '핸드폰', 'phone'].some((k) => raw.includes(k)) &&
      !['학부모', '보호자', 'parent'].some((k) => raw.includes(k))
    ) {
      colMap.phone = colNumber;
    } else if (['학부모', '보호자', '학부모연락처', '학부모전화', 'parentphone'].some((k) => raw.includes(k))) {
      colMap.parentPhone = colNumber;
    }
  });

  // If no "name" column detected, fallback to column 1 as name
  if (!colMap.name) {
    colMap.name = 1;
  }

  const students: StudentInput[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const name = colMap.name ? extractCellValue(row.getCell(colMap.name).value) : '';
    if (!name) continue; // skip empty rows

    const schoolName = colMap.schoolName ? extractCellValue(row.getCell(colMap.schoolName).value) : '';
    const grade = colMap.grade ? extractCellValue(row.getCell(colMap.grade).value) : '';
    const genderRaw = colMap.gender ? extractCellValue(row.getCell(colMap.gender).value) : '';
    const phone = colMap.phone ? extractCellValue(row.getCell(colMap.phone).value) : '';
    const parentPhone = colMap.parentPhone ? extractCellValue(row.getCell(colMap.parentPhone).value) : '';

    students.push({
      name,
      schoolName: schoolName || undefined,
      grade: grade || undefined,
      gender: parseGender(genderRaw),
      phone: phone || undefined,
      parentPhone: parentPhone || undefined,
      siblingIds: []
    });
  }

  return students;
}

export async function generateStudentTemplateExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('학생등록양식');

  sheet.columns = [
    { header: '이름 (필수)', key: 'name', width: 16 },
    { header: '학교', key: 'schoolName', width: 18 },
    { header: '학년', key: 'grade', width: 14 },
    { header: '성별 (남/여)', key: 'gender', width: 14 },
    { header: '전화번호', key: 'phone', width: 18 },
    { header: '학부모 연락처', key: 'parentPhone', width: 18 }
  ];

  // Header styling
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF333333' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F0F0' }
  };

  // Sample data rows
  sheet.addRow({
    name: '김민수',
    schoolName: '신사중',
    grade: '2학년',
    gender: '남',
    phone: '010-1234-5678',
    parentPhone: '010-9876-5432'
  });

  sheet.addRow({
    name: '이지은',
    schoolName: '압구정고',
    grade: '1학년',
    gender: '여',
    phone: '010-2222-3333',
    parentPhone: '010-4444-5555'
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
