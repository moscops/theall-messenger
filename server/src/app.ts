import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { StudentRepository } from './repositories/studentRepository.js';
import { createStudentsRouter } from './routes/students.js';
import type { Broadcaster } from './broadcast.js';

export function createApp(db: Database.Database, broadcast: Broadcaster): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/students', createStudentsRouter(new StudentRepository(db), broadcast));

  return app;
}
