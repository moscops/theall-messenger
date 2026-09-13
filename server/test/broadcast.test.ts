import { describe, expect, it, vi } from 'vitest';
import { createBroadcaster } from '../src/broadcast.js';

describe('createBroadcaster', () => {
  it('sends a changed message to every open client', () => {
    const openClient = { readyState: 1, OPEN: 1, send: vi.fn() };
    const closedClient = { readyState: 3, OPEN: 1, send: vi.fn() };
    const wss = { clients: new Set([openClient, closedClient]) };

    const broadcast = createBroadcaster(wss as never);
    broadcast('students');

    expect(openClient.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'changed', topic: 'students' })
    );
    expect(closedClient.send).not.toHaveBeenCalled();
  });
});
