import { Router } from 'express';
import type { ApiResponse } from '@theall/shared';
import type Database from 'better-sqlite3';
import { computeCalendarEvents } from '../services/calendar.js';
import { parseDateRange } from '../services/dateRange.js';
import { buildExcelBuffer } from '../services/excelExport.js';

export function createExcelExportRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range.ok) {
      const response: ApiResponse<never> = { success: false, error: range.error };
      res.status(400).json(response);
      return;
    }
    const events = computeCalendarEvents(db, range.from, range.to);
    const buffer = await buildExcelBuffer(events);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="theall-calendar-${range.from}_${range.to}.xlsx"`);
    res.send(buffer);
  });

  return router;
}
