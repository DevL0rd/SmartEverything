import {
  DEFAULT_COMPUTER_SCOPES,
  NODE_FRAME,
  type ComputerScopes,
  type NodeFrame,
  type WindowsState,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../src/node/collectors/collector';
import { ComputerNode } from '../../src/node/computer-node';
import type { ComputerControls } from '../../src/node/controls/controls';
import { localLinks } from '../support/local-links';
import { captureLogs, testLogger } from '../support/logs';
import { until } from '../support/wait';
import { unusedControls } from './controls/unused-controls';
import { CPU, SUMMARY } from './sample-parts';

const FIREFOX = { id: 'firefox.desktop', name: 'Firefox' };

function windows(focused: boolean): WindowsState {
  return {
    windows: [{ id: '1', title: 'Home', app: FIREFOX, desktop: null, minimised: false, focused }],
  };
}

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly scopes: (over: Partial<ComputerScopes>) => void;
  readonly windowsChanged: (state: WindowsState) => void;
  readonly watching: () => number;
  readonly locked: (locked: boolean) => Promise<void>;
}

function rig(): Rig {
  captureLogs();
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame) => {
    sent.push(NODE_FRAME.parse(frame));
  });
  const listeners = new Set<(state: WindowsState) => void>();
  let onSession: Parameters<ComputerControls['session']['start']>[0] | null = null;
  const collector: ComputerCollector = {
    hello: () => ({
      machineId: '0123456789abcdef0123456789abcdef',
      hostname: 'desk',
      os: { name: 'Linux', kernel: '6.0' },
      hardware: { vendor: null, product: null, portable: false },
      cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
      memoryBytes: 8e9,
      interfaces: [],
      bootedAt: '2026-10-08T09:00:00.000Z',
      power: [],
      actions: [],
      permissions: [],
      features: ['cpu', 'windows'],
      role: 'pc',
    }),
    readers: {
      summary: () => SUMMARY,
      cpu: () => CPU,
      gpu: () => null,
      memory: () => null,
      disks: () => null,
      network: () => null,
      sensors: () => null,
      power: () => null,
    },
    track: () => undefined,
    stop: () => undefined,
  };
  const unused = unusedControls();
  const controls: ComputerControls = {
    ...unused,
    power: { available: () => Promise.resolve([]), run: () => Promise.resolve() },
    processes: {
      list: () => Promise.reject(new Error('unused')),
      signal: () => undefined,
      watch: () => undefined,
      read: () => null,
      stop: () => undefined,
    },
    links: () => [],
    session: {
      start: (listener) => {
        onSession = listener;
        return Promise.resolve();
      },
      stop: () => Promise.resolve(),
      setVolume: () => Promise.resolve(),
      setMuted: () => Promise.resolve(),
      playback: () => Promise.resolve(),
    },
    apps: {
      installed: () => Promise.resolve([]),
      open: () => Promise.resolve(),
      close: () => Promise.resolve(0),
    },
    files: {
      list: () => Promise.reject(new Error('unused')),
      read: () => Promise.reject(new Error('unused')),
      range: () => Promise.reject(new Error('unused')),
    },
    capture: { capture: () => Promise.reject(new Error('unused')) },
    windows: {
      ...unused.windows,
      watch: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
  const node = new ComputerNode({
    collector,
    controls,
    link: links.node,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    log: testLogger('node'),
  });
  node.start();
  return {
    node,
    sent,
    scopes: (over): void => {
      links.hub.send({ type: 'scopes', scopes: { ...DEFAULT_COMPUTER_SCOPES, ...over } });
    },
    windowsChanged: (state): void => {
      listeners.forEach((listener) => {
        listener(state);
      });
    },
    watching: () => listeners.size,
    locked: async (locked): Promise<void> => {
      await until(() => onSession !== null, 'the session watch');
      onSession?.({
        at: '2026-10-08T10:00:00.000Z',
        user: 'ada',
        locked,
        focused: null,
        volume: null,
        muted: null,
        media: null,
      });
    },
  };
}

function appFrames(sent: readonly NodeFrame[]): readonly string[] {
  return sent.flatMap((frame) =>
    frame.type === 'app_events'
      ? [
          `${frame.baseline ? 'baseline' : 'live'}:${frame.events.map((event) => event.kind).join(',')}`,
        ]
      : [],
  );
}

let current: Rig | null = null;

beforeEach(() => {
  current?.node.stop();
  current = null;
});

function started(): Rig {
  current = rig();
  return current;
}

describe('the app events a computer node reports', () => {
  it('reports the apps already open as a baseline, then only what changes', () => {
    const test = started();
    test.scopes({});
    test.windowsChanged(windows(true));
    test.windowsChanged(windows(true));
    test.windowsChanged(windows(false));
    test.windowsChanged({ windows: [] });
    expect(appFrames(test.sent)).toEqual([
      'baseline:opened,focused',
      'live:unfocused',
      'live:closed',
    ]);
  });

  it('does not watch windows while the app events permission is off', () => {
    const test = started();
    test.scopes({ app_events: false });
    expect(test.watching()).toBe(0);
    test.windowsChanged(windows(true));
    expect(appFrames(test.sent)).toEqual([]);
  });

  it('does not watch windows while the apps permission is off', () => {
    const test = started();
    test.scopes({ apps: false });
    expect(test.watching()).toBe(0);
  });

  it('stops watching when the permission is turned off and baselines again when it is back on', () => {
    const test = started();
    test.scopes({});
    expect(test.watching()).toBe(1);
    test.windowsChanged(windows(true));
    test.scopes({ app_events: false });
    expect(test.watching()).toBe(0);
    test.scopes({});
    test.windowsChanged(windows(true));
    expect(appFrames(test.sent)).toEqual(['baseline:opened,focused', 'baseline:opened,focused']);
  });

  it('reports the app leaving the front when the screen locks', async () => {
    const test = started();
    test.scopes({});
    test.windowsChanged(windows(true));
    await test.locked(true);
    await test.locked(false);
    expect(appFrames(test.sent)).toEqual([
      'baseline:opened,focused',
      'live:unfocused',
      'live:focused',
    ]);
  });

  it('stops watching when the node stops', () => {
    const test = started();
    test.scopes({});
    test.node.stop();
    expect(test.watching()).toBe(0);
  });
});
