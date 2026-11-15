import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutSettleHost } from './hidden-aware-element-layout';

function browserQueueMicrotask(this: unknown, task: () => void): void {
  if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
  task();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the layout settle host on the web', () => {
  it('queues the settle pass through the window, as browsers require', () => {
    vi.stubGlobal('queueMicrotask', browserQueueMicrotask);
    const task = vi.fn();
    layoutSettleHost.queue(task);
    expect(task).toHaveBeenCalledOnce();
  });
});
