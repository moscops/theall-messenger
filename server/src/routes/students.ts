import { Router } from 'express';
import { studentInputSchema, type ApiResponse, type Student } from '@theall/shared';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createStudentsRouter(repo: StudentRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<Student[]> = { success: true, data: repo.list() };
    res.json(response);
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
