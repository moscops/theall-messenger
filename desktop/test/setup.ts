import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vite.config.ts does not set test.globals, so Testing Library's automatic
// cleanup registration never fires. Without this, DOM from one test in a
// multi-test file stays mounted for the next test, causing "multiple
// elements found" failures.
afterEach(() => {
  cleanup();
});

type Listener = (event: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((l) => l !== listener)
    );
  }

  dispatchEvent(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close(): void {
    this.dispatchEvent('close', {});
  }
}

// jsdom does not implement WebSocket
(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

export { MockWebSocket };
