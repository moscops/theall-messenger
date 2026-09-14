import type {
  ApiResponse,
  Student,
  StudentInput,
  Class,
  ClassInput,
  ClinicAssignment,
  ClinicAssignmentInput,
  AttendanceLog,
  AttendanceLogInput,
  RosterEntry,
  NoShowAlertConfig,
  NoShowAlertConfigInput,
  ScheduleException,
  ScheduleExceptionInput,
  StudentComment,
  StudentCommentInput,
  HandoverNote,
  HandoverNoteInput
} from '@theall/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? 'request failed');
  }
  return body.data;
}

export async function downloadFile(path: string, defaultFilename: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`파일 다운로드 실패 (${res.status})`);
  }
  const disposition = res.headers.get('content-disposition');
  let filename = defaultFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const studentsApi = {
  list: () => request<Student[]>('/students'),
  create: (input: StudentInput) =>
    request<Student>('/students', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: StudentInput) =>
    request<Student>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/students/${id}`, { method: 'DELETE' }),
  importExcel: (base64: string) =>
    request<{ count: number; students: Student[] }>('/students/import-excel', {
      method: 'POST',
      body: JSON.stringify({ base64 })
    }),
  downloadTemplate: () => downloadFile('/students/template', '학생등록양식.xlsx')
};

export const classesApi = {
  list: () => request<Class[]>('/classes'),
  create: (input: ClassInput) =>
    request<Class>('/classes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ClassInput) =>
    request<Class>(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/classes/${id}`, { method: 'DELETE' })
};

export const clinicsApi = {
  list: () => request<ClinicAssignment[]>('/clinics'),
  create: (input: ClinicAssignmentInput) =>
    request<ClinicAssignment>('/clinics', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ClinicAssignmentInput) =>
    request<ClinicAssignment>(`/clinics/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/clinics/${id}`, { method: 'DELETE' })
};

export const attendanceApi = {
  roster: (date: string) => request<RosterEntry[]>(`/attendance/roster?date=${date}`),
  checkIn: (input: AttendanceLogInput) =>
    request<AttendanceLog>('/attendance/check-in', { method: 'POST', body: JSON.stringify(input) })
};

export const alertConfigApi = {
  get: () => request<NoShowAlertConfig>('/attendance/alert-config'),
  update: (input: NoShowAlertConfigInput) =>
    request<NoShowAlertConfig>('/attendance/alert-config', { method: 'PUT', body: JSON.stringify(input) })
};

export const exceptionsApi = {
  list: () => request<ScheduleException[]>('/exceptions'),
  create: (input: ScheduleExceptionInput) =>
    request<ScheduleException>('/exceptions', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ScheduleExceptionInput) =>
    request<ScheduleException>(`/exceptions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/exceptions/${id}`, { method: 'DELETE' })
};

export const commentsApi = {
  list: () => request<StudentComment[]>('/comments'),
  create: (input: StudentCommentInput) =>
    request<StudentComment>('/comments', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: StudentCommentInput) =>
    request<StudentComment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/comments/${id}`, { method: 'DELETE' })
};

export const handoverNotesApi = {
  list: () => request<HandoverNote[]>('/handover-notes'),
  create: (input: HandoverNoteInput) =>
    request<HandoverNote>('/handover-notes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: HandoverNoteInput) =>
    request<HandoverNote>(`/handover-notes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/handover-notes/${id}`, { method: 'DELETE' })
};

export const exportApi = {
  downloadCalendarExcel: (from: string, to: string) =>
    downloadFile(`/export/excel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, `캘린더일정-${from}_${to}.xlsx`),
  downloadCalendarPdf: (from: string, to: string) =>
    downloadFile(`/export/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, `캘린더일정-${from}_${to}.pdf`),
  downloadStudentsExcel: () =>
    downloadFile('/export/excel/students', `학생명단-${new Date().toISOString().slice(0, 10)}.xlsx`),
  downloadStudentsPdf: () =>
    downloadFile('/export/pdf/students', `학생명단-${new Date().toISOString().slice(0, 10)}.pdf`)
};

