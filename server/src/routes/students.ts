import { Router } from 'express';
import { studentInputSchema, type ApiResponse, type Student, type StudentInput } from '@theall/shared';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { Broadcaster } from '../broadcast.js';
import { generateStudentTemplateExcel, parseStudentsFromExcel } from '../services/studentExcelImport.js';

export function createStudentsRouter(repo: StudentRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<Student[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.get('/template', async (_req, res, next) => {
    try {
      const buffer = await generateStudentTemplateExcel();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="theall-student-template.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post('/import-excel', async (req, res, next) => {
    try {
      const { base64 } = req.body as { base64?: string };
      if (!base64 || typeof base64 !== 'string') {
        const response: ApiResponse<never> = { success: false, error: 'base64 data required' };
        res.status(400).json(response);
        return;
      }
      const buffer = Buffer.from(base64, 'base64');
      const studentInputs = await parseStudentsFromExcel(buffer);
      if (studentInputs.length === 0) {
        const response: ApiResponse<never> = {
          success: false,
          error: '엑셀 파일에서 유효한 학생 데이터를 찾을 수 없습니다.'
        };
        res.status(400).json(response);
        return;
      }
      const created = repo.createMany(studentInputs);
      broadcast('students');
      const response: ApiResponse<{ count: number; students: Student[] }> = {
        success: true,
        data: { count: created.length, students: created }
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/batch', (req, res) => {
    const items = req.body?.students;
    if (!Array.isArray(items)) {
      const response: ApiResponse<never> = { success: false, error: 'students array required' };
      res.status(400).json(response);
      return;
    }
    const validInputs: StudentInput[] = [];
    for (const item of items) {
      const parsed = studentInputSchema.safeParse(item);
      if (parsed.success) {
        validInputs.push(parsed.data);
      }
    }
    const created = repo.createMany(validInputs);
    broadcast('students');
    const response: ApiResponse<{ count: number; students: Student[] }> = {
      success: true,
      data: { count: created.length, students: created }
    };
    res.status(201).json(response);
  });

  router.post('/', (req, res) => {
    const parsed = studentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const student = repo.create(parsed.data);
    broadcast('students');
    const response: ApiResponse<Student> = { success: true, data: student };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = studentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const student = repo.update(req.params.id, parsed.data);
    if (!student) {
      const response: ApiResponse<never> = { success: false, error: 'student not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('students');
    const response: ApiResponse<Student> = { success: true, data: student };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'student not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('students');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
