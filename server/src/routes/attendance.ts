import { Router } from 'express';
import { attendanceLogInputSchema, type ApiResponse, type AttendanceLog, type RosterEntry } from '@theall/shared';
import type Database from 'better-sqlite3';
import type { AttendanceRepository } from '../repositories/attendanceRepository.js';
import type { Broadcaster } from '../broadcast.js';
import { computeRoster } from '../services/roster.js';

export function createAttendanceRouter(
  db: Database.Database,
  repo: AttendanceRepository,
  broadcast: Broadcaster
): Router {
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

  router.get('/roster', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'date query param (YYYY-MM-DD) is required'
      };
      res.status(400).json(response);
      return;
    }
    const roster = computeRoster(db, date);
    const response: ApiResponse<RosterEntry[]> = { success: true, data: roster };
    res.json(response);
  });

  return router;
}
