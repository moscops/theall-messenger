import { Router } from 'express';
import { studentCommentInputSchema, type ApiResponse, type StudentComment } from '@theall/shared';
import type { StudentCommentRepository } from '../repositories/studentCommentRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createCommentsRouter(repo: StudentCommentRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<StudentComment[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = studentCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const comment = repo.create(parsed.data);
    broadcast('comments');
    const response: ApiResponse<StudentComment> = { success: true, data: comment };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = studentCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const comment = repo.update(req.params.id, parsed.data);
    if (!comment) {
      const response: ApiResponse<never> = { success: false, error: 'comment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('comments');
    const response: ApiResponse<StudentComment> = { success: true, data: comment };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'comment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('comments');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
