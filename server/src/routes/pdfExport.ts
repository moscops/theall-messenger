import { Router, type NextFunction } from 'express';
import type { ApiResponse } from '@theall/shared';
import type Database from 'better-sqlite3';
import { computeCalendarEvents } from '../services/calendar.js';
import { parseDateRange } from '../services/dateRange.js';
import { buildPdfBuffer } from '../services/pdfExport.js';

export function createPdfExportRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', async (req, res, next: NextFunction) => {
    try {
      const range = parseDateRange(req.query.from, req.query.to);
      if (!range.ok) {
        const response: ApiResponse<never> = { success: false, error: range.error };
        res.status(400).json(response);
        return;
      }
      const events = computeCalendarEvents(db, range.from, range.to);
      const buffer = await buildPdfBuffer(events);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="theall-calendar-${range.from}_${range.to}.pdf"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
