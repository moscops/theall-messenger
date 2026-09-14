import { Router } from 'express';
import { handoverNoteInputSchema, type ApiResponse, type HandoverNote } from '@theall/shared';
import type { HandoverNoteRepository } from '../repositories/handoverNoteRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createHandoverNotesRouter(repo: HandoverNoteRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<HandoverNote[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = handoverNoteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const note = repo.create(parsed.data);
    broadcast('handover');
    const response: ApiResponse<HandoverNote> = { success: true, data: note };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = handoverNoteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const note = repo.update(req.params.id, parsed.data);
    if (!note) {
      const response: ApiResponse<never> = { success: false, error: 'handover note not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('handover');
    const response: ApiResponse<HandoverNote> = { success: true, data: note };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'handover note not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('handover');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
