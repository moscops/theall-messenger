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

export const studentsApi = {
  list: () => request<Student[]>('/students'),
  create: (input: StudentInput) =>
    request<Student>('/students', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: StudentInput) =>
    request<Student>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<null>(`/students/${id}`, { method: 'DELETE' })
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
