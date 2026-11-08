import type { WebUpdateApplyTarget, WebUpdateStatus } from '@smarteverything/domain';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { hubCapabilities, hubCapabilitiesArgument } from '../src/hub-network/capabilities.js';

type Listener = (event: unknown, value?: unknown) => void;

const exposed: { name: string; api: unknown }[] = [];
const invocations: { channel: string; request: unknown }[] = [];
const answers = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

vi.mock('electron', () => {
  const ipcRenderer = {
    invoke: (channel: string, request: unknown): Promise<unknown> => {
      invocations.push({ channel, request });
      return Promise.resolve(answers.get(channel));
    },
    on: (channel: string, listener: Listener): void => {
      listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener));
    },
    removeListener: (channel: string, listener: Listener): void => {
      listeners.get(channel)?.delete(listener);
    },
    postMessage: (): void => undefined,
    sendSync: (): undefined => undefined,
  };
  const contextBridge = {
    exposeInMainWorld: (name: string, api: unknown): void => {
      exposed.push({ name, api });
    },
  };
  return { default: { ipcRenderer, contextBridge }, ipcRenderer, contextBridge };
});

const OFFER = {
  id: '2f1c7a52-0e0a-4c0e-9c58-1d4f2f6a9b11',
  createdAt: '2026-10-20T00:00:00.000Z',
  appVersion: '1.2.3',
  notes: 'a change',
  size: 10,
  files: [],
};

const READY: WebUpdateStatus = { state: 'ready', offer: OFFER };

interface WebBridge {
  readonly webUpdateStatus: () => Promise<WebUpdateStatus>;
  readonly checkWebUpdate: (channel: 'release' | 'dev') => Promise<WebUpdateStatus>;
  readonly downloadWebUpdate: (expectedId: string) => Promise<WebUpdateStatus>;
  readonly applyWebUpdate: (target: WebUpdateApplyTarget) => Promise<WebUpdateStatus>;
  readonly onWebUpdateStatus: (listener: (status: WebUpdateStatus) => void) => () => void;
  readonly onWebUpdateConfirmRequested: (listener: () => void) => () => void;
  readonly confirmWebBundle: () => Promise<void>;
  readonly reportWebBundleFailure: (reason: string) => Promise<void>;
}

const BRIDGE_METHODS = [
  'webUpdateStatus',
  'checkWebUpdate',
  'downloadWebUpdate',
  'applyWebUpdate',
  'onWebUpdateStatus',
  'onWebUpdateConfirmRequested',
  'confirmWebBundle',
  'reportWebBundleFailure',
] as const;

const BRIDGE = z.custom<WebBridge>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    BRIDGE_METHODS.every((method) => typeof Reflect.get(value, method) === 'function'),
  'the preload bridge must expose every web update method',
);

function bridge(): WebBridge {
  return BRIDGE.parse(exposed[0]?.api);
}

beforeAll(async () => {
  process.argv.push('--smarteverything-version=9.9.9');
  process.argv.push(hubCapabilitiesArgument(hubCapabilities(false)));
  vi.stubGlobal('window', { addEventListener: (): void => undefined });
  await import('../src/preload.js');
});

describe('the web update bridge', () => {
  it('exposes the bridge once under the agreed name with every web update method', () => {
    expect(exposed.map((entry) => entry.name)).toStrictEqual(['smartEverythingDesktop']);
    expect(BRIDGE.safeParse(exposed[0]?.api).success).toBe(true);
  });

  it('returns the parsed status for an argument-free status call', async () => {
    const channel = 'desktop:web-update-status';
    answers.set(channel, READY);

    expect(await bridge().webUpdateStatus()).toStrictEqual(READY);
    expect(invocations.at(-1)).toStrictEqual({ channel, request: undefined });
  });

  it('passes through the selected download and apply targets and parses their statuses', async () => {
    const download = 'desktop:web-update-download';
    const apply = 'desktop:web-update-apply';
    const target = { kind: 'update', id: OFFER.id } as const;
    answers.set(download, READY);
    answers.set(apply, { state: 'applying' });

    expect(await bridge().downloadWebUpdate(OFFER.id)).toStrictEqual(READY);
    expect(await bridge().applyWebUpdate(target)).toStrictEqual({ state: 'applying' });
    expect(invocations.slice(-2)).toStrictEqual([
      { channel: download, request: OFFER.id },
      { channel: apply, request: target },
    ]);
  });

  it('sends the channel with a check', async () => {
    answers.set('desktop:web-update-check', READY);

    await bridge().checkWebUpdate('dev');

    expect(invocations.at(-1)).toStrictEqual({
      channel: 'desktop:web-update-check',
      request: 'dev',
    });
  });

  it('rejects an answer that is not a web update status and names the channel', async () => {
    answers.set('desktop:web-update-status', { state: 'unknown' });

    await expect(bridge().webUpdateStatus()).rejects.toThrow(
      /desktop:web-update-status answered something unexpected/u,
    );
  });

  it('confirms the boot and reports a failure reason through their channels', async () => {
    await bridge().confirmWebBundle();
    await bridge().reportWebBundleFailure('the shell threw');

    expect(invocations.slice(-2)).toStrictEqual([
      { channel: 'desktop:web-update-confirm', request: undefined },
      { channel: 'desktop:web-update-report-failure', request: 'the shell threw' },
    ]);
  });
});

describe('the web update events', () => {
  it('forwards parsed statuses until unsubscribed', () => {
    const received: WebUpdateStatus[] = [];
    const stop = bridge().onWebUpdateStatus((status) => {
      received.push(status);
    });
    const channel = listeners.get('desktop:web-update-status-changed') ?? new Set();

    for (const listener of channel) listener({}, READY);
    stop();
    for (const listener of channel) listener({}, READY);

    expect(received).toStrictEqual([READY]);
    expect(channel.size).toBe(0);
  });

  it('throws on a malformed status instead of passing it on', () => {
    const received: unknown[] = [];
    const stop = bridge().onWebUpdateStatus((status) => {
      received.push(status);
    });

    for (const listener of listeners.get('desktop:web-update-status-changed') ?? []) {
      expect(() => {
        listener({}, { state: 'ready' });
      }).toThrow(/desktop:web-update-status-changed answered something unexpected/u);
    }
    stop();
    expect(received).toStrictEqual([]);
  });

  it('tells the page that the tray asked for the restart confirm', () => {
    const asked: string[] = [];
    const stop = bridge().onWebUpdateConfirmRequested(() => {
      asked.push('asked');
    });

    for (const listener of listeners.get('desktop:web-update-confirm-requested') ?? []) {
      listener({});
    }
    stop();

    expect(asked).toStrictEqual(['asked']);
    expect(listeners.get('desktop:web-update-confirm-requested')?.size).toBe(0);
  });
});
