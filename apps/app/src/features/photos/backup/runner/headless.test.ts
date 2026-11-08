import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreState } from '../../../../store/state';
import type { BackupScope } from './sessions';
import type { SettingsPort } from './ports';
import type { ScopeInput } from './scope';
import type { Mock } from 'vitest';
import type { PhotosBackupPref } from '@smarteverything/domain';
import { PREFS } from '../../../../store/prefs';
import { makeTable } from '../../../../store/state';
import { phoneStoreState } from './lifecycle-fixtures';
import { rig, rowOf } from './fixtures';

interface FakeHeadless {
  state: StoreState | null;
  scope: BackupScope | null;
  connection: object;
  status: string;
  available: boolean;
  load: Mock<() => void>;
  call: Mock<() => Promise<object>>;
  start: Mock<() => void>;
  ready: Mock<() => Promise<void>>;
  stop: Mock<() => void>;
  slot: Mock<(enabled: boolean) => Promise<void>>;
  create: Mock<(input: ScopeInput) => Promise<BackupScope | null>>;
}

const fake = vi.hoisted((): FakeHeadless => ({
  state: null,
  scope: null,
  connection: {},
  status: 'loading',
  available: true,
  load: vi.fn<() => void>(),
  call: vi.fn<() => Promise<object>>(),
  start: vi.fn<() => void>(),
  ready: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => void>(),
  slot: vi.fn<(enabled: boolean) => Promise<void>>(),
  create: vi.fn<(input: ScopeInput) => Promise<BackupScope | null>>(),
}));

vi.mock('../../../../api/transport', () => ({
  api: (): { readonly call: typeof fake.call } => ({ call: fake.call }),
  loadConnection: (): Promise<void> => {
    fake.load();
    fake.status = 'paired';
    return Promise.resolve();
  },
}));
vi.mock('../../../../api/connection/connection', () => ({
  connectionState: {
    get: (): { readonly status: string; readonly connection: object } => ({
      status: fake.status,
      connection: fake.connection,
    }),
    subscribe: (): (() => void) => () => undefined,
  },
}));
vi.mock('../../../../api/connection/active-route', () => ({
  routeFor: (): {
    readonly start: typeof fake.start;
    readonly ready: typeof fake.ready;
    readonly stop: typeof fake.stop;
  } => ({
    start: fake.start,
    ready: fake.ready,
    stop: fake.stop,
  }),
}));
vi.mock('../../../../store/live-reducers', () => ({
  replaceWith: (): StoreState | null => fake.state,
}));
vi.mock('./app-state', () => ({ backupAppIsActive: (): boolean => false }));
vi.mock('./native-adapters', () => ({ nativeBackupAvailable: (): boolean => fake.available }));
vi.mock('./background', () => ({ syncBackupSlot: fake.slot }));
vi.mock('./scope', () => ({
  capturedSettings: (value: PhotosBackupPref): SettingsPort => ({
    read: (): PhotosBackupPref => value,
    subscribe: (): (() => void) => () => undefined,
  }),
  createBackupScope: fake.create,
}));

const { runHeadlessBackup } = await import('./headless');
const { backupSessions } = await import('./sessions');

beforeEach(async () => {
  await backupSessions.setForeground(null);
  vi.clearAllMocks();
  fake.state = phoneStoreState();
  fake.scope = null;
  fake.status = 'loading';
  fake.available = true;
  fake.call.mockResolvedValue({});
  fake.ready.mockResolvedValue(undefined);
  fake.slot.mockResolvedValue(undefined);
  fake.create.mockImplementation(() => Promise.resolve(fake.scope));
});

describe('headless backup boot', () => {
  it('loads secure enrollment and snapshot without React, uploads and releases its route', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    fake.scope = {
      key: 'cold',
      authority: fake.connection,
      create: (): typeof t.ports => t.ports,
      attach: (): (() => void) => () => undefined,
    };
    const state = fake.state;
    if (state === null) throw new Error('Missing fixture');
    const key = PREFS.photosBackup.storageKey;
    const row = {
      page: key,
      client_id: state.session?.client.id ?? null,
      profile_id: null,
      layout: PREFS.photosBackup.encode({ ...PREFS.photosBackup.defaultValue, enabled: true }),
      updated_at: '2026-11-01T00:00:00.000Z',
    };
    fake.state = {
      ...state,
      tables: { ...state.tables, layouts: makeTable({ [key]: row }, [key], 1) },
    };
    await runHeadlessBackup();
    expect(fake.load).toHaveBeenCalledOnce();
    expect(fake.start).toHaveBeenCalledOnce();
    expect(fake.call).toHaveBeenCalledOnce();
    expect(fake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: state.session?.client.id,
        profileId: state.session?.client.profile_id,
      }),
    );
    expect(t.upload.started.map((item) => item.uri)).toEqual(['photo']);
    expect(fake.stop).toHaveBeenCalledOnce();
  });

  it('unregisters disabled backup without constructing a runner or reading media', async () => {
    await runHeadlessBackup();
    expect(fake.slot).toHaveBeenCalledWith(false);
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.stop).toHaveBeenCalledOnce();
  });

  it('does no snapshot/media work after unpairing or with missing native support', async () => {
    fake.status = 'unpaired';
    await runHeadlessBackup();
    expect(fake.call).not.toHaveBeenCalled();
    expect(fake.slot).toHaveBeenCalledWith(false);
    fake.available = false;
    fake.status = 'loading';
    await runHeadlessBackup();
    expect(fake.load).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
  });
});
