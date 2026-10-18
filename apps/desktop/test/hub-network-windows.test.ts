import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeHubTrust } from '@smarteverything/domain';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
  type PinnedHub,
} from '../../hub/test/support/pinned-hub';

type Handler = (event: unknown, value: unknown) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
}));

const START_URL = 'app://smarteverything/';
const closers: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

interface Window {
  readonly id: number;
  readonly destroy: () => void;
  readonly navigate: (inPlace: boolean) => void;
  readonly invoke: (channel: string, value?: unknown) => Promise<unknown>;
}

function openWindow(id: number): Window {
  const destroyed: (() => void)[] = [];
  const navigations: ((...args: unknown[]) => void)[] = [];
  const frame = { url: START_URL };
  const contents = {
    id,
    mainFrame: frame,
    isDestroyed: (): boolean => false,
    getURL: (): string => START_URL,
    send: (): void => undefined,
    once: (_event: string, listener: () => void): void => {
      destroyed.push(listener);
    },
    on: (event: string, listener: (...args: unknown[]) => void): void => {
      if (event === 'did-start-navigation') navigations.push(listener);
    },
  };
  return {
    id,
    destroy: (): void => {
      for (const listener of destroyed) listener();
    },
    navigate: (inPlace: boolean): void => {
      for (const listener of navigations) listener({}, START_URL, inPlace, true);
    },
    invoke: (channel: string, value?: unknown): Promise<unknown> => {
      const handler = handlers.get(channel);
      if (handler === undefined) throw new Error(`no handler for ${channel}`);
      return Promise.resolve(handler({ senderFrame: frame, sender: contents }, value));
    },
  };
}

async function pinnedHub(): Promise<{ readonly hub: PinnedHub; readonly trust: NativeHubTrust }> {
  const certificate = await issueCertificate(newKey(), newServerName());
  const hub = await listenPinned(certificate, (_request, response) => {
    response.end('home');
  });
  closers.push(hub.close);
  return { hub, trust: trustFor(certificate, hub.port, 'home') };
}

async function get(window: Window, url: string): Promise<unknown> {
  return window.invoke('desktop:hub-request', {
    scopeId: 'home',
    url,
    method: 'GET',
    headers: {},
    body: null,
  });
}

async function register(): Promise<void> {
  const { registerHubNetworkIpc } = await import('../src/hub-network/ipc.js');
  const registration = await registerHubNetworkIpc(START_URL, false);
  closers.push(registration.close);
}

describe('hub network with several windows', () => {
  it('keeps a home reachable for the second window when the first one closes', async () => {
    const { hub, trust } = await pinnedHub();
    await register();
    const first = openWindow(1);
    const second = openWindow(2);
    await first.invoke('desktop:hub-configure-trust', trust);
    await second.invoke('desktop:hub-configure-trust', trust);
    first.destroy();
    expect(await get(second, hub.url)).toMatchObject({ status: 200, body: 'home' });
  });

  it('withdraws a home when the last window using it clears it', async () => {
    const { hub, trust } = await pinnedHub();
    await register();
    const first = openWindow(1);
    const second = openWindow(2);
    await first.invoke('desktop:hub-configure-trust', trust);
    await second.invoke('desktop:hub-configure-trust', trust);
    await first.invoke('desktop:hub-clear-trust', 'home');
    expect(await get(second, hub.url)).toMatchObject({ status: 200 });
    await second.invoke('desktop:hub-clear-trust', 'home');
    await expect(get(second, hub.url)).rejects.toThrow('no enrolled trust');
  });

  it('lets a second window read a home that the first window configured', async () => {
    const { hub, trust } = await pinnedHub();
    await register();
    await openWindow(1).invoke('desktop:hub-configure-trust', trust);
    expect(await get(openWindow(2), hub.url)).toMatchObject({ status: 200 });
  });

  it('keeps a home reachable across in-place navigation and releases it on a document change', async () => {
    const { hub, trust } = await pinnedHub();
    await register();
    const window = openWindow(1);
    await window.invoke('desktop:hub-configure-trust', trust);
    window.navigate(true);
    expect(await get(window, hub.url)).toMatchObject({ status: 200, body: 'home' });
    window.navigate(false);
    await expect(get(window, hub.url)).rejects.toThrow('no enrolled trust');
  });
});
