import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import type * as Platform from '../../../../design/platform';
import type * as Prefs from '../../../../store/prefs';
import { EntityStore } from '../../../../store/entity-store';
import { PREFS } from '../../../../store/prefs';
import type { BackupScope } from './sessions';
import type { ScopeInput } from './scope';
import { PHONE_SESSION, phoneStoreState } from './lifecycle-fixtures';
import { watchBackupHost } from './host';

const fake = vi.hoisted(() => ({
  prefReads: 0,
  create: vi.fn<(input: ScopeInput) => Promise<BackupScope>>(),
  foreground: vi.fn<(scope: BackupScope | null) => Promise<void>>(),
  connection: { url: 'https://hub.test', token: `set_${'a'.repeat(64)}` },
}));

vi.mock('../../../../store/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof Prefs>();
  return {
    ...actual,
    prefOf: (...args: Parameters<typeof actual.prefOf>): ReturnType<typeof actual.prefOf> => {
      fake.prefReads += 1;
      return actual.prefOf(...args);
    },
  };
});
vi.mock('../../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof Platform>()),
  appPlatform: (): string => 'web',
  isNative: (): boolean => false,
  desktopBridge: (): null => null,
}));
vi.mock('../../../../api/transport', () => ({ useConnection: vi.fn() }));
vi.mock('../../../../api/connection/connection', () => ({
  connectionState: {
    get: (): { readonly status: string; readonly connection: typeof fake.connection } => ({
      status: 'paired',
      connection: fake.connection,
    }),
    subscribe: (): (() => void) => () => undefined,
  },
}));
vi.mock('./scope', () => ({ createBackupScope: fake.create }));
vi.mock('./sessions', () => ({ backupSessions: { setForeground: fake.foreground } }));
vi.mock('./platform-adapters', () => ({ backupAvailable: (): boolean => true }));
vi.mock('./background', () => ({ syncBackupSlot: vi.fn() }));

const PHONE = '00000000-0000-4000-8000-000000000003';
let frames: (() => void)[] = [];
let off: (() => void) | undefined;
let seq = 0;

function runFrames(): void {
  while (frames.length > 0) {
    const due = frames;
    frames = [];
    for (const callback of due) callback();
  }
}

function heartbeat(): LiveChange {
  seq += 1;
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq,
    record: {
      device_id: PHONE,
      capability: 'battery',
      value: seq % 100,
      observed_at: new Date(Date.UTC(2026, 10, 15, 0, 0, seq)).toISOString(),
    },
    oldRecord: null,
  });
}

function backupPrefChange(enabled: boolean): LiveChange {
  seq += 1;
  const current = PREFS.photosBackup.decode(null);
  if (current.status === 'invalid') throw new Error(current.reason);
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'layouts',
    operation: 'UPDATE',
    seq,
    record: {
      client_id: PHONE_SESSION.client.id,
      profile_id: null,
      page: PREFS.photosBackup.storageKey,
      layout: PREFS.photosBackup.encode({ ...current.value, enabled }),
      updated_at: new Date(Date.UTC(2026, 10, 15, 1, 0, seq)).toISOString(),
    },
    oldRecord: null,
  });
}

async function settled(): Promise<void> {
  for (let step = 0; step < 4; step += 1) await Promise.resolve();
}

function openHost(): EntityStore {
  const store = new EntityStore();
  store.update(() => phoneStoreState());
  off = watchBackupHost(store, fake.connection);
  return store;
}

function burst(store: EntityStore, count: number): void {
  for (let step = 0; step < count; step += 1) {
    store.apply([heartbeat()]);
    runFrames();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  fake.prefReads = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
  fake.foreground.mockResolvedValue(undefined);
  fake.create.mockImplementation((input) =>
    Promise.resolve({
      key: input.identity.deviceId,
      authority: fake.connection,
      create: (): never => {
        throw new Error('No ports needed');
      },
      attach: (): (() => void) => () => undefined,
    }),
  );
});
afterEach(() => {
  off?.();
  vi.unstubAllGlobals();
});

describe('photos backup host store subscriptions', () => {
  it('does no backup work for device state heartbeats it never reads', async () => {
    const store = openHost();
    await settled();
    expect(fake.create).toHaveBeenCalledTimes(1);
    fake.prefReads = 0;
    burst(store, 150);
    expect(fake.prefReads).toBe(0);
  });

  it('refreshes once with a single preference read when the backup preference changes', async () => {
    const store = openHost();
    await settled();
    fake.prefReads = 0;
    store.apply([backupPrefChange(true)]);
    runFrames();
    expect(fake.prefReads).toBe(1);
  });

  it('wakes the settings listener only when the stored backup preference row changes', async () => {
    const store = openHost();
    await settled();
    const input = fake.create.mock.calls[0]?.[0];
    if (input === undefined) throw new Error('The backup scope was not opened');
    const heard = vi.fn();
    const stop = input.settings.subscribe(heard);
    fake.prefReads = 0;
    burst(store, 150);
    expect(fake.prefReads).toBe(0);
    expect(heard).not.toHaveBeenCalled();
    store.apply([backupPrefChange(true)]);
    runFrames();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(input.settings.read().enabled).toBe(true);
    stop();
    store.apply([backupPrefChange(false)]);
    runFrames();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
