import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '../../../store/state';

interface Probe {
  readonly timings: number[];
  readonly writes: number[];
  readonly done: ((finished: boolean) => void)[];
  snapshot: RouterSnapshot | null;
}

const probe: Probe = vi.hoisted(() => ({ timings: [], writes: [], done: [], snapshot: null }));

const passthrough = vi.hoisted(
  () =>
    function passthrough(props: { readonly children?: unknown }): ReactNode {
      return [props.children].flat().filter((child) => isValidElement(child));
    },
);

vi.mock('react-native', () => ({
  View: passthrough,
  StyleSheet: { absoluteFill: {} },
}));

vi.mock('react-native-svg', () => ({
  default: passthrough,
  Circle: (): null => null,
  Path: (): null => null,
}));

vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  class Animation {
    constructor(
      readonly target: number,
      readonly done: (finished: boolean) => void,
    ) {}
  }
  return {
    default: { createAnimatedComponent: () => (): null => null },
    Easing: { out: (curve: unknown): unknown => curve, cubic: (): number => 0 },
    useAnimatedProps: (): object => ({}),
    useSharedValue: <T>(initial: T): { get: () => T; set: (next: T | Animation) => void } => {
      const box = useRef<{ value: T } | null>(null);
      box.current ??= { value: initial };
      const held = box.current;
      return {
        get: (): T => held.value,
        set: (next: T | Animation): void => {
          if (next instanceof Animation) {
            probe.timings.push(next.target);
            probe.done.push(next.done);
            return;
          }
          held.value = next;
          if (typeof next === 'number') probe.writes.push(next);
        },
      };
    },
    withTiming: (target: number, _: unknown, done: (finished: boolean) => void): Animation =>
      new Animation(target, done),
    cancelAnimation: (): undefined => undefined,
  };
});

const LAST: SpeedTestResult = {
  id: '2f8f2c0e-4f4a-4c37-9d5b-0d8c1e5a7b11',
  at: '2026-10-17T10:00:00.000+00:00',
  server: 'Local',
  downloadMbps: 800,
  uploadMbps: 41,
  pingMs: 8,
  jitterMs: 1,
  packetLossPercent: 0,
};

vi.mock('uniwind', () => ({ useUniwind: (): { theme: string } => ({ theme: 'dark' }) }));
vi.mock('../../../components/charts', async () => ({
  Arc: (await import('../../../components/charts/arc')).Arc,
}));
vi.mock('../../../components/glow', () => ({ Glow: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/widget-board', () => ({ frameClassOf: (): string => 's' }));
vi.mock('../../../features/devices', () => ({ isWideClass: (): boolean => false }));
vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));
vi.mock('../../shared/service-names', () => ({ ServiceNames: (): null => null }));
vi.mock('./router-cell', () => ({ RouterCellFace: (): null => null }));
vi.mock('../router-data', () => ({
  useRouterSnapshot: (): { state: 'ready'; value: RouterSnapshot } | { state: 'waiting' } =>
    probe.snapshot === null ? { state: 'waiting' } : { state: 'ready', value: probe.snapshot },
  useSpeedTests: (): object => ({
    run: { running: false },
    list: { state: 'ready', tests: [LAST] },
  }),
}));

const { RouterFace } = await import('./router-card-faces');

function frame(downloadMbps: number): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection: { state: 'online' },
    cadence: 'fast',
    intervalSeconds: 1,
    info: null,
    system: null,
    network: {
      wanUp: true,
      protocol: 'dhcp',
      publicIp: '203.0.113.24',
      gateway: null,
      dns: [],
      downloadMbps,
      uploadMbps: 21.7,
      lanDownloadMbps: 34,
      lanUploadMbps: 12,
      latencyMs: 12,
      packetLossPercent: 0,
      ports: [],
    },
    radios: [],
    stations: [],
    clients: [],
    people: [],
  };
}

const DEVICE: Device = {
  id: 'device-1',
  provider: 'local',
  external_id: 'router-1',
  parent_id: null,
  kind: 'router',
  name: 'Router',
  display_name: null,
  model: 'Test',
  manufacturer: 'Test',
  provider_room: null,
  room_id: null,
  online: true,
  capabilities: [],
  details: {},
  hidden: false,
  favourite: false,
  position: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  label: 'Router',
};

let root: Root;

function stream(downloadMbps: number): void {
  probe.snapshot = frame(downloadMbps);
  act(() => {
    root.render(createElement(RouterFace, { device: DEVICE, size: 'tile', showRoom: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  probe.timings.length = 0;
  probe.writes.length = 0;
  probe.done.length = 0;
  probe.snapshot = null;
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('RouterFace medallion ring', () => {
  it('draws the line share in once, then sets each live router frame without a new animation', () => {
    stream(400);
    act(() => {
      for (const done of probe.done) done(true);
    });
    for (let second = 1; second <= 10; second += 1) stream(400 + second * 20);
    expect(probe.timings).toEqual([0.5]);
    expect(probe.writes).toHaveLength(10);
    expect(probe.writes.at(-1)).toBeCloseTo(0.75);
  });
});
