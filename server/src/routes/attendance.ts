import { Router } from 'express';
import { attendanceLogInputSchema, type ApiResponse, type AttendanceLog } from '@theall/shared';
import type { AttendanceRepository } from '../repositories/attendanceRepository.js';
import type { Broadcaster } from '../broadcast.js';

export function createAttendanceRouter(repo: AttendanceRepository, broadcast: Broadcaster): Router {
  const router = Router();

  router.post('/check-in', (req, res) => {
    const parsed = attendanceLogInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = { success: false, error: parsed.error.message };
      res.status(400).json(response);
      return;
    }
    const log = repo.checkIn(parsed.data);
    broadcast('attendance');
    const response: ApiResponse<AttendanceLog> = { success: true, data: log };
    res.status(201).json(response);
  });

  return router;
}
