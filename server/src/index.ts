import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { createBroadcaster } from './broadcast.js';
import { logger } from './logger.js';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? './data.sqlite3';

const db = createDb(DB_PATH);
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  socket.on('error', (err) => logger.error('websocket error', err));
});
wss.on('error', (err) => logger.error('websocket server error', err));

const broadcast = createBroadcaster(wss);
const app = createApp(db, broadcast);

httpServer.on('request', app);
httpServer.listen(PORT, HOST, () => {
  logger.info(`TheAll Messenger server listening on ${HOST}:${PORT}`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down`);
  httpServer.close(() => {
    wss.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
