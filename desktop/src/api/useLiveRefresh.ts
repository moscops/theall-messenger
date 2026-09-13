import { useEffect } from 'react';
import type { ChangeMessage, ChangeTopic } from '@theall/shared';
import { logger } from '../logger';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000';
const RECONNECT_DELAY_MS = 3000;

export function useLiveRefresh(topic: ChangeTopic, onChange: () => void): void {
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = (): void => {
      if (stopped) return;
      socket = new WebSocket(WS_URL);

      socket.addEventListener('message', (event: MessageEvent<string>) => {
        let message: ChangeMessage;
        try {
          message = JSON.parse(event.data) as ChangeMessage;
        } catch (error: unknown) {
          logger.error('failed to parse live-refresh message', error);
          return;
        }
        if (message.type === 'changed' && message.topic === topic) {
          onChange();
        }
      });

      socket.addEventListener('close', () => {
        if (stopped) return;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      });

      socket.addEventListener('error', (event) => {
        logger.error('live-refresh websocket error', event);
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [topic, onChange]);
}
