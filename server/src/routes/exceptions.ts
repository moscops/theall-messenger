import { Router } from 'express';
import { scheduleExceptionInputSchema, type ApiResponse, type ScheduleException } from '@theall/shared';
import type { ScheduleExceptionRepository } from '../repositories/scheduleExceptionRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createExceptionsRouter(repo: ScheduleExceptionRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<ScheduleException[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = scheduleExceptionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const exception = repo.create(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<ScheduleException> = { success: true, data: exception };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = scheduleExceptionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const exception = repo.update(req.params.id, parsed.data);
    if (!exception) {
      const response: ApiResponse<never> = { success: false, error: 'exception not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('attendance');
    const response: ApiResponse<ScheduleException> = { success: true, data: exception };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'exception not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('attendance');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
