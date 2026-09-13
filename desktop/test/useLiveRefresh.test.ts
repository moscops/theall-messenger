import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useLiveRefresh } from '../src/api/useLiveRefresh';
import { MockWebSocket } from './setup';

describe('useLiveRefresh', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('calls onChange when a matching changed message arrives', () => {
    const onChange = vi.fn();
    renderHook(() => useLiveRefresh('students', onChange));

    const socket = MockWebSocket.instances[0];
    socket.dispatchEvent('message', {
      data: JSON.stringify({ type: 'changed', topic: 'students' })
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a changed message for a different topic', () => {
    const onChange = vi.fn();
    renderHook(() => useLiveRefresh('students', onChange));

    const socket = MockWebSocket.instances[0];
    socket.dispatchEvent('message', {
      data: JSON.stringify({ type: 'changed', topic: 'classes' })
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a malformed message instead of throwing', () => {
    const onChange = vi.fn();
    renderHook(() => useLiveRefresh('students', onChange));

    const socket = MockWebSocket.instances[0];
    expect(() => socket.dispatchEvent('message', { data: 'not json' })).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reconnects with a new socket after the connection closes', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderHook(() => useLiveRefresh('students', onChange));

    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].dispatchEvent('close', {});
    vi.advanceTimersByTime(3000);

    expect(MockWebSocket.instances).toHaveLength(2);
    vi.useRealTimers();
  });
});
