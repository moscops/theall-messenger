import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { createBroadcaster } from './broadcast.js';
import { logger } from './logger.js';

const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.DB_PATH ?? './data.sqlite3';

const db = createDb(DB_PATH);
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });
const broadcast = createBroadcaster(wss);
const app = createApp(db, broadcast);

httpServer.on('request', app);
httpServer.listen(PORT, () => {
  logger.info(`TheAll Messenger server listening on port ${PORT}`);
});
