import {
  DEFAULT_COMPUTER_SCOPES,
  type ComputerScopes,
  type HistoryPolicy,
  type DiscoveredDevice,
  type HubFrame,
  type NodeHello,
  type ProcessWindow,
} from '@smarteverything/domain';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import type { AppTime } from '../../src/computers/app-focus';
import { ComputerSession } from '../../src/computers/computer-session';
import { Viewers } from '../../src/metrics/viewers';
import { testLogger } from './logs';

export const HELLO: NodeHello = {
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
  features: [],
  role: 'pc',
};

export interface SessionRig {
  readonly session: ComputerSession;
  readonly viewers: Viewers<ProcessWindow>;
  readonly sent: HubFrame[];
  readonly deliver: (frame: unknown) => void;
}

export interface SessionRigOptions {
  readonly directory?: ComputerDirectory;
  readonly hello?: NodeHello;
  readonly appTime?: (time: AppTime) => void;
  readonly devices?: (devices: readonly DiscoveredDevice[]) => void;
  readonly hubComputerResolved?: (deviceId: string) => void;
}

export function sessionRig(deviceId: string, options: SessionRigOptions = {}): SessionRig {
  const sent: HubFrame[] = [];
  const listeners = new Set<(frame: unknown) => void>();
  const viewers = new Viewers<ProcessWindow>();
  const session = new ComputerSession({
    link: {
      send: (frame): void => {
        sent.push(frame);
      },
      onFrame: (listener): (() => void) => {
        listeners.add(listener);
        return (): void => {
          listeners.delete(listener);
        };
      },
    },
    sink: {
      state: (): void => undefined,
      event: (): void => undefined,
      devices: (devices): void => {
        options.devices?.(devices);
      },
      failure: (): void => undefined,
      online: (): void => undefined,
    },
    history: { push: (): void => undefined },
    viewers,
    policyOf: (): HistoryPolicy => ({ window_ms: 3_600_000, interval_ms: 1_000 }),
    publish: (): void => undefined,
    deviceIdOf: (): string => deviceId,
    scopesOf: (): ComputerScopes => DEFAULT_COMPUTER_SCOPES,
    directory: options.directory ?? new ComputerDirectory(),
    hubComputerResolved: options.hubComputerResolved ?? ((): void => undefined),
    recordAppTime: options.appTime ?? ((): void => undefined),
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    log: testLogger(),
  });
  const deliver = (frame: unknown): void => {
    listeners.forEach((listener) => {
      listener(frame);
    });
  };
  deliver({ type: 'hello', hello: options.hello ?? HELLO });
  return { session, viewers, sent, deliver };
}
