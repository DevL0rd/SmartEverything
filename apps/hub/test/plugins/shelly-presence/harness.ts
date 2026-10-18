import { vi } from 'vitest';
import { JSON_VALUE, type AdapterSink } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../src/local/device-driver';
import { ShellySession } from '../../../src/plugins/builtin/shelly-presence/session';
import {
  DEVICE_ID,
  FakeShelly,
  enrollmentAt,
  memoryRecords,
  until,
  type HttpHandler,
  type RpcHandler,
} from './fake-shelly';

export interface Harness {
  readonly session: ShellySession;
  readonly sink: { readonly state: ReturnType<typeof vi.fn<AdapterSink['state']>> };
  readonly failures: unknown[];
  readonly inventory: ReturnType<typeof vi.fn>;
  readonly tracks: ReturnType<typeof vi.fn>;
  readonly enrollments: ReturnType<typeof memoryRecords>;
  readonly forgotten: readonly (readonly string[])[];
}

const open: { shelly: FakeShelly; session: ShellySession }[] = [];

export async function closeHarnesses(): Promise<void> {
  for (const { shelly, session } of open.splice(0)) {
    session.stop();
    await shelly.close();
  }
}

export interface HarnessOptions {
  readonly recordedAddress?: string;
  readonly handler?: RpcHandler;
  readonly settled?: (session: ShellySession) => boolean;
  readonly setPassword?: (password: string | null) => Promise<string | null>;
  readonly methods?: readonly string[];
  readonly rpc?: (shelly: FakeShelly) => RpcHandler;
  readonly http?: HttpHandler;
  readonly snapshots?: ReturnType<typeof memoryRecords>;
}

export interface DriverFixture {
  readonly context: DeviceDriverContext;
  readonly forgotten: string[][];
}

export function driverContext(
  state: ReturnType<typeof vi.fn<AdapterSink['state']>>,
  failures: unknown[],
): DriverFixture {
  const forgotten: string[][] = [];
  return {
    forgotten,
    context: {
      sink: {
        state,
        event: vi.fn(),
        online: vi.fn(),
        devices: vi.fn(),
        failure: (failure): void => {
          failures.push(failure.cause);
        },
      },
      publishEvent: () => Promise.resolve('event'),
      publishDevices: () => Promise.resolve(),
      signal: new AbortController().signal,
      forget: (ids): Promise<void> => {
        forgotten.push([...ids]);
        return Promise.resolve();
      },
    },
  };
}

export async function harness(
  options: HarnessOptions = {},
): Promise<Harness & { readonly shelly: FakeShelly }> {
  const shelly = await FakeShelly.open();
  if (options.handler !== undefined) shelly.handler = options.handler;
  if (options.methods !== undefined) shelly.methods = [...options.methods];
  if (options.rpc !== undefined) shelly.handler = options.rpc(shelly);
  if (options.http !== undefined) shelly.http = options.http;
  const state = vi.fn<AdapterSink['state']>();
  const failures: unknown[] = [];
  const inventory = vi.fn();
  const tracks = vi.fn();
  const enrollments = memoryRecords();
  if (options.recordedAddress !== undefined)
    enrollments.put(DEVICE_ID, JSON_VALUE.parse(enrollmentAt(options.recordedAddress)));
  const session = new ShellySession({
    enrollment: enrollmentAt(shelly.address),
    password: null,
    tls: null,
    setPassword: options.setPassword ?? ((): Promise<string | null> => Promise.resolve(null)),
    enrollments,
    snapshots: options.snapshots ?? memoryRecords(),
    inventoryChanged: inventory,
    tracksChanged: tracks,
  });
  const driver = driverContext(state, failures);
  const { context, forgotten } = driver;
  open.push({ shelly, session });
  session.start(context);
  const settled =
    options.settled ??
    ((ready: ShellySession): boolean => ready.current().connection.state === 'online');
  await until(() => settled(session), 'the session to settle');
  return {
    session,
    sink: { state },
    failures,
    inventory,
    tracks,
    enrollments,
    forgotten,
    shelly,
  };
}
