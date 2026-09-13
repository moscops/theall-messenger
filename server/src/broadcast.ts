import type { WebSocketServer } from 'ws';

export type ChangeTopic = 'students' | 'classes' | 'clinics';

export function createBroadcaster(wss: WebSocketServer) {
  return function broadcastChange(topic: ChangeTopic): void {
    const message = JSON.stringify({ type: 'changed', topic });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  };
}

export type Broadcaster = ReturnType<typeof createBroadcaster>;
