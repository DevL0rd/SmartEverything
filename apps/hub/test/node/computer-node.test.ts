import {
  DEFAULT_COMPUTER_SCOPES,
  type AudioState,
  NODE_FRAME,
  type ComputerScopes,
  type HubFrame,
  type NodeFrame,
  type NodeHello,
  type ProcessWindow,
  type ServicesState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComputerCollector } from '../../src/node/collectors/collector';
import { ComputerNode } from '../../src/node/computer-node';
import type { ComputerControls } from '../../src/node/controls/controls';
import { localLinks } from '../support/local-links';
import { captureLogs, testLogger } from '../support/logs';
import { unusedControls } from './controls/unused-controls';
import { CPU, SUMMARY } from './sample-parts';

const HELLO: NodeHello = {
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
  features: ['cpu'],
  role: 'pc',
};

const WINDOW: ProcessWindow = {
  sort: 'cpu',
  order: 'descending',
  tree: false,
  gpu: false,
  offset: 0,
  limit: 20,
};

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly hub: (frame: HubFrame) => void;
  readonly watched: (ProcessWindow | null)[];
  readonly tracked: (number | null)[];
}

function controls(watched: (ProcessWindow | null)[]): ComputerControls {
  return {
    ...unusedControls(),
    power: { available: () => Promise.resolve([]), run: () => Promise.resolve() },
    processes: {
      list: () => Promise.reject(new Error('unused')),
      signal: () => undefined,
      watch: (window): void => {
        watched.push(window);
      },
      read: () => null,
      stop: () => undefined,
    },
    links: () => [],
    session: {
      start: () => Promise.reject(new Error('no session')),
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
  };
}

function rig(over: Partial<ComputerControls> = {}): Rig {
  captureLogs();
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame): void => {
    sent.push(NODE_FRAME.parse(frame));
  });
  const watched: (ProcessWindow | null)[] = [];
  const tracked: (number | null)[] = [];
  const collector: ComputerCollector = {
    hello: () => HELLO,
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
    track: (policy): void => {
      tracked.push(policy === null ? null : policy.interval_ms);
    },
    stop: () => undefined,
  };
  const node = new ComputerNode({
    collector,
    controls: { ...controls(watched), ...over },
    link: links.node,
    now: (): Date => new Date(),
    log: testLogger('node'),
  });
  return {
    node,
    sent,
    hub: (frame): void => {
      links.hub.send(frame);
    },
    watched,
    tracked,
  };
}

function samples(sent: readonly NodeFrame[]): string[][] {
  return sent.flatMap((frame) => (frame.type === 'sample' ? [Object.keys(frame.parts)] : []));
}

function scopes(over: Partial<ComputerScopes>): HubFrame {
  return { type: 'scopes', scopes: { ...DEFAULT_COMPUTER_SCOPES, ...over } };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 5_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function started(over: Partial<ComputerControls> = {}): Promise<Rig> {
  const rigged = rig(over);
  rigged.node.start();
  await vi.advanceTimersByTimeAsync(0);
  return rigged;
}

describe('ComputerNode greeting and sampling', () => {
  it('says hello with the features of the collector and the desktop, then sends the idle summary', async () => {
    const { sent } = await started();
    const hello = sent.find((frame) => frame.type === 'hello');
    expect(hello?.type === 'hello' && hello.hello.features).toEqual([
      'cpu',
      'processes',
      'files',
      'capture',
    ]);
    expect(samples(sent)).toEqual([['summary']]);
  });

  it('records history from the start although nobody is watching', async () => {
    const { node, sent, hub } = await started();
    await vi.advanceTimersByTimeAsync(9000);
    hub({
      type: 'request',
      id: 'r1',
      request: {
        verb: 'history',
        query: { topics: ['summary', 'cpu'], maxPoints: 100, windowMs: 60_000 },
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    const reply = sent.find((frame) => frame.type === 'reply');
    expect(reply?.type === 'reply' && reply.result.ok).toBe(true);
    const value = reply?.type === 'reply' && reply.result.ok ? reply.result.value : null;
    expect(value).toMatchObject({ intervalMs: 1000, windowMs: 1_800_000 });
    expect(JSON.stringify(value)).toContain('"cpuLoad"');
    expect(JSON.stringify(value)).toContain('"core0"');
    node.stop();
  });

  it('sends the demanded parts and stops when the demand is withdrawn', async () => {
    const { sent, hub } = await started();
    sent.length = 0;
    hub({ type: 'demand', demand: { topics: { cpu: 1000, summary: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(samples(sent)).toEqual([['summary', 'cpu']]);
    sent.length = 0;
    hub({ type: 'demand', demand: { topics: {} } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(samples(sent).flat()).not.toContain('cpu');
  });

  it('passes the process window on while processes are demanded and not permitted otherwise', async () => {
    const { watched, hub } = await started();
    hub({ type: 'demand', demand: { topics: { processes: 1000 }, processes: WINDOW } });
    await vi.advanceTimersByTimeAsync(0);
    expect(watched.at(-1)).toEqual(WINDOW);
    hub(scopes({ processes: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(watched.at(-1)).toBeNull();
  });

  it('stops sampling, drops history and the gpu stream when the metrics scope is off, and resumes', async () => {
    const { sent, hub, tracked } = await started();
    await vi.advanceTimersByTimeAsync(3000);
    hub(scopes({ metrics: false }));
    await vi.advanceTimersByTimeAsync(0);
    sent.length = 0;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(samples(sent)).toEqual([]);
    expect(tracked.at(-1)).toBeNull();
    hub({
      type: 'request',
      id: 'r2',
      request: { verb: 'history', query: { topics: ['summary'], maxPoints: 10, windowMs: 60_000 } },
    });
    await vi.advanceTimersByTimeAsync(0);
    const refused = sent.find((frame) => frame.type === 'reply');
    expect(refused?.type === 'reply' && !refused.result.ok && refused.result.failure.code).toBe(
      'scope_off',
    );
    hub(scopes({ metrics: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(samples(sent)).toEqual([['summary']]);
    expect(tracked.at(-1)).toBe(1000);
  });

  it('follows a new history policy', async () => {
    const { node, sent, hub, tracked } = await started();
    node.setHistoryPolicy({ interval_ms: 5000, window_ms: 600_000 });
    expect(tracked.at(-1)).toBe(5000);
    await vi.advanceTimersByTimeAsync(0);
    sent.length = 0;
    hub({
      type: 'request',
      id: 'r3',
      request: { verb: 'history', query: { topics: ['summary'], maxPoints: 10, windowMs: 60_000 } },
    });
    await vi.advanceTimersByTimeAsync(0);
    const reply = sent.find((frame) => frame.type === 'reply');
    const value = reply?.type === 'reply' && reply.result.ok ? reply.result.value : null;
    expect(value).toMatchObject({ intervalMs: 5000, windowMs: 600_000 });
  });
});

const AUDIO: AudioState = { outputs: [], inputs: [], apps: [] };

const SERVICES: ServicesState = { services: [], timers: [] };

interface Audio {
  readonly control: ComputerControls['audio'];
  readonly change: (state: AudioState) => void;
  readonly watching: () => number;
}

function audio(): Audio {
  const listeners = new Set<(state: AudioState) => void>();
  const base = unusedControls().audio;
  return {
    control: {
      ...base,
      watch: (onChange) => {
        listeners.add(onChange);
        onChange(AUDIO);
        return (): void => {
          listeners.delete(onChange);
        };
      },
    },
    change: (state): void => {
      listeners.forEach((listener) => {
        listener(state);
      });
    },
    watching: () => listeners.size,
  };
}

function services(): ComputerControls['system'] {
  const base = unusedControls().system;
  return { ...base, services: { ...base.services, list: () => Promise.resolve(SERVICES) } };
}

function states(sent: readonly NodeFrame[]): string[][] {
  return sent.flatMap((frame) =>
    frame.type === 'state' ? [Object.keys(frame.parts).filter((name) => name !== 'session')] : [],
  );
}

describe('ComputerNode state parts', () => {
  it('watches a demanded state topic, sends each change and stops when the demand ends', async () => {
    const sound = audio();
    const { sent, hub } = await started({ audio: sound.control });
    sent.length = 0;
    hub({ type: 'demand', demand: { topics: { summary: 1000, audio: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(states(sent)).toEqual([['audio']]);
    sound.change({ ...AUDIO, apps: [] });
    expect(states(sent)).toEqual([['audio'], ['audio']]);
    hub({ type: 'demand', demand: { topics: { summary: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sound.watching()).toBe(0);
  });

  it('reads a state topic without a watch once when demanded', async () => {
    const { sent, hub } = await started({ system: services() });
    sent.length = 0;
    hub({ type: 'demand', demand: { topics: { services: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    const frame = sent.find((sentFrame) => sentFrame.type === 'state');
    expect(frame?.type === 'state' && frame.parts.services).toEqual(SERVICES);
  });

  it('keeps state topics off while their scope is off, also with metrics off', async () => {
    const sound = audio();
    const { sent, hub } = await started({ audio: sound.control });
    hub(scopes({ system: false, metrics: false }));
    hub({ type: 'demand', demand: { topics: { audio: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sound.watching()).toBe(0);
    hub(scopes({ metrics: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sound.watching()).toBe(1);
    expect(states(sent).at(-1)).toEqual(['audio']);
  });

  it('stops watching state when the node stops', async () => {
    const sound = audio();
    const { node, hub } = await started({ audio: sound.control });
    hub({ type: 'demand', demand: { topics: { audio: 1000 } } });
    await vi.advanceTimersByTimeAsync(0);
    node.stop();
    expect(sound.watching()).toBe(0);
  });
});
