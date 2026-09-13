import { Router } from 'express';
import { classInputSchema, type ApiResponse, type Class } from '@theall/shared';
import type { ClassRepository } from '../repositories/classRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createClassesRouter(repo: ClassRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<Class[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = classInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const klass = repo.create(parsed.data);
    broadcast('classes');
    const response: ApiResponse<Class> = { success: true, data: klass };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = classInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const klass = repo.update(req.params.id, parsed.data);
    if (!klass) {
      const response: ApiResponse<never> = { success: false, error: 'class not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('classes');
    const response: ApiResponse<Class> = { success: true, data: klass };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'class not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('classes');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
