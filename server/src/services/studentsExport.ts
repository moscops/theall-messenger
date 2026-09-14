import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { loadNotoSansKRRegular } from '@reogrid/font-kr';
import type Database from 'better-sqlite3';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface StudentExportRow {
  schoolGrade: string;
  name: string;
  gender: string;
  attendanceTimeText: string;
  classTimeText: string;
  latestComment: string;
  phone: string;
  parentPhone: string;
}

export function computeStudentsExportData(db: Database.Database): StudentExportRow[] {
  const students = db.prepare('SELECT * FROM students ORDER BY name').all() as {
    id: string;
    name: string;
    grade: string | null;
    school_name: string | null;
    gender: string | null;
    phone: string | null;
    parent_phone: string | null;
  }[];

  const classes = db.prepare('SELECT * FROM classes').all() as { id: string; name: string }[];
  const classStudents = db.prepare('SELECT class_id, student_id FROM class_enrollments').all() as {
    class_id: string;
    student_id: string;
  }[];
  const classSlots = db.prepare('SELECT * FROM class_schedule_slots').all() as {
    class_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[];
  const clinics = db.prepare('SELECT * FROM clinic_assignments').all() as {
    student_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[];
  const comments = db.prepare('SELECT * FROM student_comments ORDER BY created_at DESC').all() as {
    student_id: string;
    content: string;
  }[];

  return students.map((s) => {
    const schoolGrade = [s.school_name, s.grade].filter(Boolean).join(' ') || '—';
    const gender = s.gender === 'male' ? '남' : s.gender === 'female' ? '여' : '—';

    // Classes for this student
    const enrolledClassIds = new Set(classStudents.filter((cs) => cs.student_id === s.id).map((cs) => cs.class_id));
    const studentClasses = classes.filter((c) => enrolledClassIds.has(c.id));
    const studentClinics = clinics.filter((cl) => cl.student_id === s.id);

    // Day schedule aggregation
    const dayMap = new Map<number, { minStart: string; maxEnd: string; classSlots: string[]; clinicSlots: string[] }>();

    function addSlot(day: number, start: string, end: string, label: string, isClinic = false) {
      if (!dayMap.has(day)) {
        dayMap.set(day, { minStart: start, maxEnd: end, classSlots: [], clinicSlots: [] });
      }
      const entry = dayMap.get(day)!;
      if (start < entry.minStart) entry.minStart = start;
      if (end > entry.maxEnd) entry.maxEnd = end;
      if (isClinic) {
        entry.clinicSlots.push(`${start}~${end}`);
      } else {
        entry.classSlots.push(`${label} ${start}~${end}`);
      }
    }

    for (const cls of studentClasses) {
      const slots = classSlots.filter((slot) => slot.class_id === cls.id);
      for (const slot of slots) {
        addSlot(slot.day_of_week, slot.start_time, slot.end_time, cls.name);
      }
    }

    for (const cl of studentClinics) {
      addSlot(cl.day_of_week, cl.start_time, cl.end_time, '클리닉', true);
    }

    const days = Array.from(dayMap.keys()).sort((a, b) => a - b);
    let attendanceTimeText = '—';
    if (days.length > 0) {
      const firstEntry = dayMap.get(days[0])!;
      const allSame = days.every(
        (d) => dayMap.get(d)!.minStart === firstEntry.minStart && dayMap.get(d)!.maxEnd === firstEntry.maxEnd
      );
      if (allSame) {
        const daysStr = days.map((d) => DAY_LABELS[d]).join('·');
        attendanceTimeText = `${daysStr} ${firstEntry.minStart}~${firstEntry.maxEnd}`;
      } else {
        attendanceTimeText = days
          .map((d) => {
            const entry = dayMap.get(d)!;
            return `${DAY_LABELS[d]} ${entry.minStart}~${entry.maxEnd}`;
          })
          .join(', ');
      }
    }

    const classParts: string[] = [];
    for (const cls of studentClasses) {
      const slots = classSlots.filter((slot) => slot.class_id === cls.id);
      const slotStrs = slots.map((sl) => `${DAY_LABELS[sl.day_of_week]} ${sl.start_time}~${sl.end_time}`);
      classParts.push(`${cls.name} (${slotStrs.join(', ') || '시간미정'})`);
    }
    if (studentClinics.length > 0) {
      const clinicStrs = studentClinics.map((cl) => `${DAY_LABELS[cl.day_of_week]} ${cl.start_time}~${cl.end_time}`);
      classParts.push(`클리닉 (${clinicStrs.join(', ')})`);
    }
    const classTimeText = classParts.length > 0 ? classParts.join(', ') : '—';

    // Latest comment
    const latestC = comments.find((c) => c.student_id === s.id);
    const latestComment = latestC ? latestC.content : '—';

    return {
      schoolGrade,
      name: s.name,
      gender,
      attendanceTimeText,
      classTimeText,
      latestComment,
      phone: s.phone || '—',
      parentPhone: s.parent_phone || '—'
    };
  });
}

export async function buildStudentsExcelBuffer(rows: StudentExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('학생관리명단');

  sheet.columns = [
    { header: '학교 및 학년', key: 'schoolGrade', width: 16 },
    { header: '이름', key: 'name', width: 14 },
    { header: '성별', key: 'gender', width: 8 },
    { header: '등원 시간대', key: 'attendanceTimeText', width: 22 },
    { header: '수업시간', key: 'classTimeText', width: 30 },
    { header: '비고란', key: 'latestComment', width: 25 },
    { header: '학생 연락처', key: 'phone', width: 16 },
    { header: '학부모 연락처', key: 'parentPhone', width: 16 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF222222' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F5F3' }
  };

  for (const row of rows) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function buildStudentsPdfBuffer(rows: StudentExportRow[]): Promise<Buffer> {
  const fontBytes = await loadNotoSansKRRegular();
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  doc.registerFont('NotoSansKR', Buffer.from(fontBytes));
  doc.font('NotoSansKR');

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const today = new Date().toISOString().slice(0, 10);

  doc.fontSize(16).text('TheAll 학생 관리 명단 및 등원 일정', { align: 'center' });
  doc.fontSize(9).fillColor('#787774').text(`출력일자: ${today} (총 ${rows.length}명)`, { align: 'center' });
  doc.moveDown(1.2);

  doc.fillColor('#37352f');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    doc.fontSize(11).font('NotoSansKR').text(`${i + 1}. ${row.name} (${row.schoolGrade}, ${row.gender})`);
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(`   • 등원 시간대: ${row.attendanceTimeText}`)
      .text(`   • 수업/클리닉: ${row.classTimeText}`)
      .text(`   • 연락처: 학생(${row.phone}) / 학부모(${row.parentPhone})`);
    if (row.latestComment && row.latestComment !== '—') {
      doc.text(`   • 비고: ${row.latestComment}`);
    }
    doc.moveDown(0.6);
    doc.fillColor('#37352f');
  }

  doc.end();
  return finished;
}
