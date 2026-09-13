import type { WebSocketServer } from 'ws';
import type { ChangeMessage, ChangeTopic } from '@theall/shared';

export type { ChangeTopic };

export function createBroadcaster(wss: WebSocketServer) {
  return function broadcastChange(topic: ChangeTopic): void {
    const message: ChangeMessage = { type: 'changed', topic };
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };
}

export type Broadcaster = ReturnType<typeof createBroadcaster>;
