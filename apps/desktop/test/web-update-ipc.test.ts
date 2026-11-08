import type { WebUpdateStatus } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, Notification: vi.fn() }));

const { registerWebUpdateIpc } = await import('../src/ipc.js');
import type { ArgumentHandle, WebUpdateIpc } from '../src/ipc.js';

const ID = '2f1c7a52-0e0a-4c0e-9c58-1d4f2f6a9b11';
const IDLE: WebUpdateStatus = {
  state: 'idle',
  running: { id: 'embedded', createdAt: '2026-10-01T00:00:00.000Z' },
};

type Registered = (argument: unknown) => unknown;

function registered(): {
  readonly calls: string[];
  readonly handlers: Map<string, Registered>;
  readonly web: WebUpdateIpc;
} {
  const calls: string[] = [];
  const handlers = new Map<string, Registered>();
  const handle: ArgumentHandle = (channel, handler) => {
    handlers.set(channel, handler);
  };
  const web: WebUpdateIpc = {
    status: () => IDLE,
    check: (channel) => {
      calls.push(`check:${channel}`);
      return Promise.resolve(IDLE);
    },
    download: (id) => {
      calls.push(`download:${id}`);
      return Promise.resolve(IDLE);
    },
    apply: (target) => {
      calls.push(target.kind === 'update' ? `apply:${target.id}` : 'apply:built_in');
      return Promise.resolve(IDLE);
    },
    confirm: () => {
      calls.push('confirm');
      return Promise.resolve();
    },
    reportFailure: (reason) => {
      calls.push(`failure:${reason}`);
      return Promise.resolve();
    },
  };
  registerWebUpdateIpc(web, handle);
  return { calls, handlers, web };
}

function handlerOf(handlers: Map<string, Registered>, channel: string): Registered {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`no handler registered for ${channel}`);
  return handler;
}

describe('the web update channels', () => {
  it('registers exactly the six invoke channels', () => {
    expect([...registered().handlers.keys()].sort()).toStrictEqual([
      'desktop:web-update-apply',
      'desktop:web-update-check',
      'desktop:web-update-confirm',
      'desktop:web-update-download',
      'desktop:web-update-report-failure',
      'desktop:web-update-status',
    ]);
  });

  it('passes the selected update or built-in target to download and apply', async () => {
    const { calls, handlers } = registered();

    expect(await handlerOf(handlers, 'desktop:web-update-status')(undefined)).toBe(IDLE);
    await handlerOf(handlers, 'desktop:web-update-download')(ID);
    const apply = handlerOf(handlers, 'desktop:web-update-apply');
    await apply({ kind: 'update', id: ID });
    await apply({ kind: 'built_in' });

    expect(calls).toStrictEqual([`download:${ID}`, `apply:${ID}`, 'apply:built_in']);
  });

  it('rejects download or apply requests without a valid target', () => {
    const { calls, handlers } = registered();
    const download = handlerOf(handlers, 'desktop:web-update-download');
    const apply = handlerOf(handlers, 'desktop:web-update-apply');

    expect(() => download(undefined)).toThrow();
    expect(() => download('latest')).toThrow();
    expect(() => apply(undefined)).toThrow();
    expect(() => apply({ kind: 'update' })).toThrow();
    expect(() => apply({ kind: 'built_in', id: ID })).toThrow();
    expect(calls).toStrictEqual([]);
  });

  it.each(['release', 'dev'])('checks the %s channel', async (channel) => {
    const { calls, handlers } = registered();

    await handlerOf(handlers, 'desktop:web-update-check')(channel);

    expect(calls).toStrictEqual([`check:${channel}`]);
  });

  it.each([['beta'], [''], [undefined], [7]])(
    'refuses the channel %j before checking',
    (channel) => {
      const { calls, handlers } = registered();

      expect(() => handlerOf(handlers, 'desktop:web-update-check')(channel)).toThrow();
      expect(calls).toStrictEqual([]);
    },
  );

  it('confirms and answers nothing', async () => {
    const { calls, handlers } = registered();

    expect(await handlerOf(handlers, 'desktop:web-update-confirm')(undefined)).toBeUndefined();
    expect(calls).toStrictEqual(['confirm']);
  });

  it('passes a failure reason on and refuses an empty or missing one', async () => {
    const { calls, handlers } = registered();
    const report = handlerOf(handlers, 'desktop:web-update-report-failure');

    await report('the shell threw');
    await expect(report('')).rejects.toThrow();
    await expect(report(undefined)).rejects.toThrow();

    expect(calls).toStrictEqual(['failure:the shell threw']);
  });
});
