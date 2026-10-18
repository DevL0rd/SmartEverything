import {
  DEFAULT_COMPUTER_SCOPES,
  DEFAULT_HISTORY_POLICY,
  type AdapterSink,
  type ComputerLiveNotice,
  type ComputerScopes,
  type ComputerSummary,
  type DiscoveredDevice,
  type HubFrame,
  type NodeHello,
  type ProcessWindow,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerSession } from '../../src/computers/computer-session';
import { Viewers } from '../../src/metrics/viewers';
import type { HubLink } from '../../src/node/link';
import { captureLogs, testLogger } from '../support/logs';

const HELLO: NodeHello = {
  machineId: '0123456789abcdef0123456789abcdef',
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  power: ['shut_down', 'lock_screen'],
  features: ['cpu', 'memory'],
  role: 'pc',
  actions: [],
  permissions: [],
};

const WINDOW: ProcessWindow = {
  sort: 'cpu',
  order: 'descending',
  tree: false,
  gpu: false,
  offset: 0,
  limit: 50,
};

function summary(load: number, battery: number | null = null): ComputerSummary {
  return {
    cpuLoad: load,
    cpuTemperature: null,
    memoryPercent: 25,
    swapPercent: null,
    gpuLoad: null,
    gpuTemperature: null,
    gpuMemoryPercent: null,
    cpuWatts: null,
    gpuWatts: null,
    downloadRate: 1234,
    uploadRate: 0,
    fullestDisk: { mount: '/home', percent: 80 },
    batteryLevel: battery,
    charging: null,
    totalWatts: null,
    processCount: 300,
    uptimeSeconds: 60,
  };
}

function sample(at: number, part: ComputerSummary): unknown {
  return { type: 'sample', at: new Date(at).toISOString(), seq: 0, parts: { summary: part } };
}

interface Recorded {
  readonly devices: DiscoveredDevice[];
  readonly states: string[];
  readonly pushes: number[];
  readonly demands: HubFrame[];
  readonly scopes: HubFrame[];
  readonly notices: ComputerLiveNotice[];
}

function start(
  viewers: Viewers<ProcessWindow>,
  options: { readonly hubMachine?: boolean; readonly scopes?: ComputerScopes } = {},
): {
  readonly recorded: Recorded;
  readonly session: ComputerSession;
  readonly send: (frame: unknown) => void;
} {
  const recorded: Recorded = {
    devices: [],
    states: [],
    pushes: [],
    demands: [],
    scopes: [],
    notices: [],
  };
  const listeners = new Set<(frame: unknown) => void>();
  const link: HubLink = {
    send: (frame): void => {
      (frame.type === 'scopes' ? recorded.scopes : recorded.demands).push(frame);
    },
    onFrame: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
  const sink: AdapterSink = {
    state: (update) => recorded.states.push(`${update.capability}=${JSON.stringify(update.value)}`),
    event: () => undefined,
    devices: (devices) => recorded.devices.push(...devices),
    failure: () => undefined,
    online: () => undefined,
  };
  const session = new ComputerSession({
    link,
    sink,
    history: {
      push: (_device, _key, value): void => {
        recorded.pushes.push(value);
      },
    },
    viewers,
    policyOf: (): typeof DEFAULT_HISTORY_POLICY => DEFAULT_HISTORY_POLICY,
    publish: (notice): void => {
      recorded.notices.push(notice);
    },
    deviceIdOf: (): string => 'device-1',
    scopesOf: (): ComputerScopes => options.scopes ?? DEFAULT_COMPUTER_SCOPES,
    directory: new ComputerDirectory(options.hubMachine === true ? HELLO.machineId : null),
    hubComputerResolved: (): void => undefined,
    recordAppTime: (): void => undefined,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    log: testLogger(),
  });
  const send = (frame: unknown): void => {
    listeners.forEach((listener) => {
      listener(frame);
    });
  };
  return { recorded, session, send };
}

const AT = Date.parse('2026-10-08T10:00:00.000Z');

beforeEach(() => {
  captureLogs();
});

describe('computer session', () => {
  it('keeps every summary in history and writes device state at most every 10 s', () => {
    const { recorded, send } = start(new Viewers());
    send({ type: 'hello', hello: HELLO });
    send(sample(AT, summary(10)));
    send(sample(AT + 1000, summary(20)));
    send(sample(AT + 10_000, summary(30)));
    expect(recorded.scopes).toEqual([{ type: 'scopes', scopes: DEFAULT_COMPUTER_SCOPES }]);
    expect(recorded.pushes.filter((value) => [10, 20, 30].includes(value))).toEqual([10, 20, 30]);
    expect(recorded.states.filter((state) => state.startsWith('cpu_load'))).toEqual([
      'cpu_load=10',
      'cpu_load=30',
    ]);
    expect(recorded.states).toContain('download_rate=1230');
    expect(recorded.states).toContain('disk_used=80');
  });

  it('writes a battery change at once instead of waiting for the next 10 s state', () => {
    const { recorded, send } = start(new Viewers());
    send({ type: 'hello', hello: HELLO });
    send(sample(AT, summary(10, 50)));
    send(sample(AT + 1000, summary(10, 49)));
    send(sample(AT + 2000, summary(10, 49)));
    expect(recorded.states.filter((state) => state.startsWith('battery_level'))).toEqual([
      'battery_level=50',
      'battery_level=49',
    ]);
  });

  it('asks the computer for exactly the topics that are watched, with the process window', () => {
    const viewers = new Viewers<ProcessWindow>();
    const { recorded, send } = start(viewers);
    send({ type: 'hello', hello: HELLO });
    viewers.hold('phone', [
      { target: 'device:device-1', topic: 'cpu' },
      { target: 'device:device-1', topic: 'processes', detail: WINDOW },
    ]);
    viewers.hold('desktop', [{ target: 'device:device-1', topic: 'cpu' }]);
    viewers.release('phone');
    viewers.release('desktop');
    const history = DEFAULT_HISTORY_POLICY;
    expect(recorded.demands).toEqual([
      { type: 'demand', demand: { topics: {}, history } },
      {
        type: 'demand',
        demand: { topics: { cpu: 1000, processes: 1000 }, processes: WINDOW, history },
      },
      { type: 'demand', demand: { topics: { cpu: 1000 }, history } },
      { type: 'demand', demand: { topics: {}, history } },
    ]);
  });

  it('leaves processes out of the demand while the processes permission is off', () => {
    const viewers = new Viewers<ProcessWindow>();
    const scopes = { ...DEFAULT_COMPUTER_SCOPES, processes: false };
    const { recorded, send } = start(viewers, { scopes });
    send({ type: 'hello', hello: HELLO });
    viewers.hold('phone', [{ target: 'device:device-1', topic: 'processes', detail: WINDOW }]);
    expect(recorded.demands.at(-1)).toEqual({
      type: 'demand',
      demand: { topics: {}, history: DEFAULT_HISTORY_POLICY },
    });
  });

  it('publishes each frame as a live notice and keeps the merged view', () => {
    const { recorded, session, send } = start(new Viewers());
    send({ type: 'hello', hello: HELLO });
    send(sample(AT, summary(10)));
    send({
      type: 'state',
      at: new Date(AT + 500).toISOString(),
      parts: { windows: { windows: [] } },
    });
    expect(recorded.notices.map((notice) => Object.keys(notice.parts))).toEqual([
      ['summary'],
      ['windows'],
    ]);
    expect(Object.keys(session.view()?.parts ?? {}).sort()).toEqual(['summary', 'windows']);
  });

  it('hides parts whose permission is off from notices and from the view', () => {
    const scopes = { ...DEFAULT_COMPUTER_SCOPES, metrics: false };
    const { recorded, session, send } = start(new Viewers(), { scopes });
    send({ type: 'hello', hello: HELLO });
    send(sample(AT, summary(10)));
    expect(recorded.notices[0]?.parts).toEqual({});
    expect(session.view()?.parts).toEqual({});
  });

  it('describes the hub and pc roles of one machine under one id with their own models', () => {
    const hub = start(new Viewers(), { hubMachine: true });
    hub.send({ type: 'hello', hello: HELLO });
    const pc = start(new Viewers());
    pc.send({ type: 'hello', hello: HELLO });
    pc.send(sample(AT, summary(10)));
    hub.send(sample(AT, summary(10)));
    const hubDevice = hub.recorded.devices.at(-1);
    const pcDevice = pc.recorded.devices.at(-1);
    expect(hubDevice?.model).toBe('smarteverything.computer.hub');
    expect(pcDevice?.model).toBe('smarteverything.computer');
    expect(hubDevice?.externalId).toBe(pcDevice?.externalId);
  });

  it('ignores frames that do not match the contract', () => {
    const { recorded, send } = start(new Viewers());
    send({ type: 'sample', at: 'soon' });
    expect(recorded.devices).toEqual([]);
  });
});
