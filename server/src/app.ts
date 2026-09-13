import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import type { ApiResponse } from '@theall/shared';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import type { Broadcaster } from './broadcast.js';
import { logger } from './logger.js';

function isForeignKeyViolation(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  const message = err instanceof Error ? err.message : '';
  return code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || message.includes('FOREIGN KEY constraint failed');
}

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const response: ApiResponse<{ status: string }> = { success: true, data: { status: 'ok' } };
    res.json(response);
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));
  app.use('/classes', createClassesRouter(new ClassRepository(db), broadcast));
  app.use('/clinics', createClinicsRouter(new ClinicRepository(db), broadcast));

  app.use((_req: Request, res: Response) => {
    const response: ApiResponse<never> = { success: false, error: 'not found' };
    res.status(404).json(response);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled request error', err);
    if (isForeignKeyViolation(err)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'referenced record does not exist'
      };
      res.status(400).json(response);
      return;
    }
    const response: ApiResponse<never> = { success: false, error: 'internal server error' };
    res.status(500).json(response);
  });

  return app;
}
