import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  runWatchAction: vi.fn((_deviceId: string, _action: unknown) =>
    Promise.resolve({ ok: true, detail: '' }),
  ),
}));
const toast = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../api/watches', () => api);
vi.mock('../../components/toast-store', () => toast);

const { WatchActionError, outcomeOf, runInOrder, useWatchCommand } = await import('./watch-config');

const WATCH = { id: 'watch-1' };
const SYNC = { type: 'refresh' } as const;
const STOP = { type: 'stop_workout' } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runInOrder', () => {
  it('sends the actions one after another', async () => {
    api.runWatchAction.mockResolvedValue({ ok: true, detail: 'done' });
    await expect(runInOrder('watch-1', [SYNC, STOP])).resolves.toEqual({
      ok: true,
      detail: 'done',
    });
    expect(api.runWatchAction.mock.calls.map((call) => call[1])).toEqual([SYNC, STOP]);
  });

  it('stops at the first action the watch refuses', async () => {
    api.runWatchAction.mockResolvedValueOnce({ ok: false, detail: 'Out of range' });
    await expect(runInOrder('watch-1', [SYNC, STOP])).rejects.toThrow(WatchActionError);
    expect(api.runWatchAction).toHaveBeenCalledTimes(1);
  });
});

describe('outcomeOf', () => {
  it('shows the reason of a failure and nothing before a first command', () => {
    expect(outcomeOf(new WatchActionError('Out of range'), undefined)).toEqual({
      ok: false,
      detail: 'Out of range',
    });
    expect(outcomeOf(null, undefined)).toBeNull();
    expect(outcomeOf(null, { ok: true, detail: '' })).toEqual({ ok: true, detail: '' });
  });
});

describe('useWatchCommand', () => {
  function command(): ReturnType<typeof useWatchCommand> {
    const captured: ReturnType<typeof useWatchCommand>[] = [];
    function Probe(): ReactNode {
      captured.push(useWatchCommand(WATCH));
      return null;
    }
    renderToStaticMarkup(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Probe)),
    );
    const [first] = captured;
    if (first === undefined) {
      throw new Error('the hook did not render');
    }
    return first;
  }

  it('says "Sent to the watch" in a toast when the watch took the change', async () => {
    api.runWatchAction.mockResolvedValue({ ok: true, detail: '' });
    command().run(SYNC);
    await vi.waitFor(() => {
      expect(toast.notify).toHaveBeenCalledWith({ message: 'Sent to the watch', tone: 'positive' });
    });
  });

  it('shows no success toast when the watch refuses', async () => {
    api.runWatchAction.mockResolvedValue({ ok: false, detail: 'Out of range' });
    command().run(SYNC);
    await vi.waitFor(() => {
      expect(api.runWatchAction).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(toast.notify).not.toHaveBeenCalled();
  });
});
