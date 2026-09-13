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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
