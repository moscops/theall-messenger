import '@testing-library/jest-dom/vitest';

class MockWebSocket {
  addEventListener(): void {}
  close(): void {}
}
// jsdom does not implement WebSocket
(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
