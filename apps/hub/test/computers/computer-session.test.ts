import {
  DEFAULT_COMPUTER_SCOPES,
  type AdapterSink,
  type ComputerScopes,
  type ComputerSnapshot,
  type HubFrame,
  type NodeHello,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ComputerSession } from '../../src/computers/computer-session';
import { Viewers } from '../../src/metrics/viewers';
import type { HubLink } from '../../src/node/link';
import { parseCpuList } from '../../src/node/collectors/linux/cpu';
import { parseNvidiaLine } from '../../src/node/collectors/linux/gpu-nvidia';
import { signatureOf } from '../../src/node/computer-node';
import { captureLogs, testLogger } from '../support/logs';

const HELLO: NodeHello = {
  machineId: '0123456789abcdef0123456789abcdef',
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  power: ['shut_down', 'lock_screen'],
};

function snapshot(at: number, load: number): ComputerSnapshot {
  return {
    at: new Date(at).toISOString(),
    uptimeSeconds: 60,
    cpu: {
      load,
      cores: [load, load],
      performanceLoad: null,
      efficiencyLoad: null,
      frequencyGhz: null,
      maxFrequencyGhz: null,
      temperature: null,
      powerWatts: null,
      powerLimitWatts: null,
      loadAverage: [0, 0, 0],
    },
    memory: { usedBytes: 2e9, totalBytes: 8e9, swapUsedBytes: 0, swapTotalBytes: 0 },
    disks: [],
    network: { downloadRate: 1234, uploadRate: 0, interfaces: [] },
    gpus: [],
    fans: [],
    sensors: [],
  };
}

interface Recorded {
  readonly devices: number[];
  readonly states: string[];
  readonly pushes: number[];
  readonly paces: HubFrame[];
  readonly scopes: HubFrame[];
}

function start(viewers: Viewers): {
  readonly recorded: Recorded;
  readonly send: (frame: unknown) => void;
} {
  const recorded: Recorded = { devices: [], states: [], pushes: [], paces: [], scopes: [] };
  const listeners = new Set<(frame: unknown) => void>();
  const link: HubLink = {
    send: (frame): void => {
      (frame.type === 'scopes' ? recorded.scopes : recorded.paces).push(frame);
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
    devices: (devices) => recorded.devices.push(devices.length),
    failure: () => undefined,
    online: () => undefined,
  };
  new ComputerSession({
    link,
    sink,
    history: {
      push: (_device, _key, value): void => {
        recorded.pushes.push(value);
      },
    },
    viewers,
    deviceIdOf: (): string => 'device-1',
    scopesOf: (): ComputerScopes => DEFAULT_COMPUTER_SCOPES,
    host: true,
    recordAppTime: (): void => undefined,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    log: testLogger(),
  });
  const send = (frame: unknown): void => {
    listeners.forEach((listener) => {
      listener(frame);
    });
  };
  return { recorded, send };
}

beforeEach(() => {
  captureLogs();
});

describe('computer session', () => {
  it('adds power actions once permitted, keeps every sample and writes state at most every 10 s', () => {
    const { recorded, send } = start(new Viewers());
    send({ type: 'hello', hello: HELLO });
    const at = Date.parse('2026-10-08T10:00:00.000Z');
    send({ type: 'snapshot', snapshot: snapshot(at, 10) });
    send({ type: 'snapshot', snapshot: snapshot(at + 1000, 20) });
    send({ type: 'snapshot', snapshot: snapshot(at + 10_000, 30) });
    expect(recorded.devices).toEqual([1, 1]);
    expect(recorded.scopes).toEqual([{ type: 'scopes', scopes: DEFAULT_COMPUTER_SCOPES }]);
    expect(recorded.pushes.filter((value) => [10, 20, 30].includes(value))).toEqual([10, 20, 30]);
    expect(recorded.states.filter((state) => state.startsWith('cpu_load'))).toEqual([
      'cpu_load=10',
      'cpu_load=30',
    ]);
    expect(recorded.states).toContain('download_rate=1230');
  });

  it('asks the node for live readings while someone is watching', () => {
    const viewers = new Viewers();
    const { recorded, send } = start(viewers);
    send({ type: 'hello', hello: HELLO });
    send({ type: 'snapshot', snapshot: snapshot(Date.parse('2026-10-08T10:00:00.000Z'), 1) });
    const release = viewers.lease('device:device-1', 'page');
    release();
    expect(recorded.paces).toEqual([
      { type: 'pace', pace: 'idle' },
      { type: 'pace', pace: 'live' },
      { type: 'pace', pace: 'idle' },
    ]);
  });

  it('ignores frames that do not match the contract', () => {
    const { recorded, send } = start(new Viewers());
    send({ type: 'snapshot', snapshot: { at: 'soon' } });
    expect(recorded.devices).toEqual([]);
  });
});

describe('linux parsers', () => {
  it('reads cpu lists and nvidia-smi lines', () => {
    expect(parseCpuList('0-3,8,10-11\n')).toEqual([0, 1, 2, 3, 8, 10, 11]);
    expect(parseNvidiaLine('0, RTX, 7, 100, 200, 50, 12.5, [N/A], 210, 3105')).toEqual([
      0,
      {
        name: 'RTX',
        vendor: 'nvidia',
        load: 7,
        memoryUsedBytes: 100 * 1024 * 1024,
        memoryTotalBytes: 200 * 1024 * 1024,
        temperature: 50,
        powerWatts: 12.5,
        powerLimitWatts: null,
        clockMhz: 210,
        maxClockMhz: 3105,
      },
    ]);
    expect(parseNvidiaLine('garbage')).toBeNull();
  });

  it('ignores time-only changes in the frame signature', () => {
    const first = snapshot(0, 10);
    expect(signatureOf(first)).toBe(signatureOf({ ...snapshot(5000, 10.01), uptimeSeconds: 99 }));
    expect(signatureOf(first)).not.toBe(signatureOf(snapshot(0, 11)));
  });
});
