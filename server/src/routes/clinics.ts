import { Router } from 'express';
import { clinicAssignmentInputSchema, type ApiResponse, type ClinicAssignment } from '@theall/shared';
import type { ClinicRepository } from '../repositories/clinicRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createClinicsRouter(repo: ClinicRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const response: ApiResponse<ClinicAssignment[]> = { success: true, data: repo.list() };
    res.json(response);
  });

  router.post('/', (req, res) => {
    const parsed = clinicAssignmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const assignment = repo.create(parsed.data);
    broadcast('clinics');
    const response: ApiResponse<ClinicAssignment> = { success: true, data: assignment };
    res.status(201).json(response);
  });

  router.patch('/:id', (req, res) => {
    const parsed = clinicAssignmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const assignment = repo.update(req.params.id, parsed.data);
    if (!assignment) {
      const response: ApiResponse<never> = { success: false, error: 'clinic assignment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('clinics');
    const response: ApiResponse<ClinicAssignment> = { success: true, data: assignment };
    res.json(response);
  });

  router.delete('/:id', (req, res) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = { success: false, error: 'clinic assignment not found' };
      res.status(404).json(response);
      return;
    }
    broadcast('clinics');
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  });

  return router;
}
