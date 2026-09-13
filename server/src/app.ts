import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { StudentRepository } from './repositories/studentRepository.js';
import { ClassRepository } from './repositories/classRepository.js';
import { ClinicRepository } from './repositories/clinicRepository.js';
import { createStudentsRouter } from './routes/students.js';
import { createClassesRouter } from './routes/classes.js';
import { createClinicsRouter } from './routes/clinics.js';
import type { Broadcaster } from './broadcast.js';

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));
  app.use('/classes', createClassesRouter(new ClassRepository(db), broadcast));
  app.use('/clinics', createClinicsRouter(new ClinicRepository(db), broadcast));

  return app;
}
