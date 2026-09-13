import { useEffect } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000';

export function useLiveRefresh(
  topic: 'students' | 'classes' | 'clinics',
  onChange: () => void
): void {
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as { type: string; topic: string };
      if (message.type === 'changed' && message.topic === topic) {
        onChange();
      }
    });
    return () => socket.close();
  }, [topic, onChange]);
}
