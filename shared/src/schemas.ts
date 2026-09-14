import { z } from 'zod';

export const genderSchema = z.enum(['male', 'female']);

export const studentInputSchema = z.object({
  name: z.string().min(1, 'name is required'),
  grade: z.string().optional(),
  schoolName: z.string().optional(),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  parentPhone: z.string().optional(),
  siblingIds: z.array(z.string()).optional()
});
export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentSchema = studentInputSchema.extend({
  id: z.string(),
  siblingIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Student = z.infer<typeof studentSchema>;

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM');
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const scheduleSlotInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema
});
export type ScheduleSlotInput = z.infer<typeof scheduleSlotInputSchema>;

export const scheduleSlotSchema = scheduleSlotInputSchema.extend({
  id: z.string()
});
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

export const classInputSchema = z.object({
  name: z.string().min(1, 'name is required'),
  teacherName: z.string().min(1, 'teacherName is required'),
  schedule: z.array(scheduleSlotInputSchema).min(1, 'at least one schedule slot is required'),
  studentIds: z.array(z.string()).optional()
});
export type ClassInput = z.infer<typeof classInputSchema>;

export const classSchema = z.object({
  id: z.string(),
  name: z.string(),
  teacherName: z.string(),
  schedule: z.array(scheduleSlotSchema),
  studentIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Class = z.infer<typeof classSchema>;

export const clinicAssignmentInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema
});
export type ClinicAssignmentInput = z.infer<typeof clinicAssignmentInputSchema>;

export const clinicAssignmentSchema = clinicAssignmentInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ClinicAssignment = z.infer<typeof clinicAssignmentSchema>;

export const attendanceLogInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  date: dateStringSchema,
  checkInTime: timeSchema,
  checkOutTime: timeSchema.optional()
});
export type AttendanceLogInput = z.infer<typeof attendanceLogInputSchema>;

export const attendanceLogSchema = attendanceLogInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type AttendanceLog = z.infer<typeof attendanceLogSchema>;

export const scheduleExceptionTargetTypeSchema = z.enum(['class', 'clinic']);
export type ScheduleExceptionTargetType = z.infer<typeof scheduleExceptionTargetTypeSchema>;

export const scheduleExceptionTypeSchema = z.enum(['absence', 'reschedule', 'makeup']);
export type ScheduleExceptionType = z.infer<typeof scheduleExceptionTypeSchema>;

export const scheduleExceptionInputSchema = z
  .object({
    studentId: z.string().min(1, 'studentId is required'),
    targetType: scheduleExceptionTargetTypeSchema,
    targetId: z.string().min(1, 'targetId is required'),
    exceptionType: scheduleExceptionTypeSchema,
    date: dateStringSchema,
    reason: z.string().optional(),
    newDate: dateStringSchema.optional(),
    newStartTime: timeSchema.optional(),
    newEndTime: timeSchema.optional()
  })
  .refine(
    (data) => {
      if (data.exceptionType === 'reschedule') {
        return Boolean(data.newDate && data.newStartTime && data.newEndTime);
      }
      if (data.exceptionType === 'makeup') {
        return Boolean(data.newStartTime && data.newEndTime);
      }
      return true;
    },
    { message: 'reschedule and makeup exceptions require new time information' }
  );
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionInputSchema>;

export const scheduleExceptionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  targetType: scheduleExceptionTargetTypeSchema,
  targetId: z.string(),
  exceptionType: scheduleExceptionTypeSchema,
  date: z.string(),
  reason: z.string().optional(),
  newDate: z.string().optional(),
  newStartTime: z.string().optional(),
  newEndTime: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;

export const studentCommentInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  date: dateStringSchema.optional(),
  author: z.string().min(1, 'author is required'),
  content: z.string().min(1, 'content is required')
});
export type StudentCommentInput = z.infer<typeof studentCommentInputSchema>;

export const studentCommentSchema = studentCommentInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type StudentComment = z.infer<typeof studentCommentSchema>;

export const noShowAlertConfigInputSchema = z.object({
  enabled: z.boolean(),
  delayMinutes: z.number().int().min(1).max(120)
});
export type NoShowAlertConfigInput = z.infer<typeof noShowAlertConfigInputSchema>;

export const noShowAlertConfigSchema = noShowAlertConfigInputSchema;
export type NoShowAlertConfig = z.infer<typeof noShowAlertConfigSchema>;

export const handoverNoteInputSchema = z.object({
  date: dateStringSchema,
  author: z.string().min(1, 'author is required'),
  content: z.string().min(1, 'content is required')
});
export type HandoverNoteInput = z.infer<typeof handoverNoteInputSchema>;

export const handoverNoteSchema = handoverNoteInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type HandoverNote = z.infer<typeof handoverNoteSchema>;

export const rosterEntrySchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  source: scheduleExceptionTargetTypeSchema,
  sourceId: z.string(),
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  checkedIn: z.boolean(),
  checkInTime: z.string().optional()
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
