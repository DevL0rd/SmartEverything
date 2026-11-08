import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DesktopComputerIdentity } from '@smarteverything/domain';
import type * as Platform from '../../../../design/platform';
import { EntityStore } from '../../../../store/entity-store';
import { makeTable } from '../../../../store/state';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { deferred } from './deferred-fixture';
import { phoneStoreState } from './lifecycle-fixtures';
import type { BackupScope } from './sessions';
import type { ScopeInput } from './scope';
import { watchBackupHost } from './host';

interface FakeHost {
  readonly identity: ReturnType<typeof vi.fn<() => Promise<DesktopComputerIdentity>>>;
  readonly foreground: ReturnType<typeof vi.fn<(scope: BackupScope | null) => Promise<void>>>;
  readonly create: ReturnType<typeof vi.fn<(input: ScopeInput) => Promise<BackupScope>>>;
  status: (() => void) | null;
  connectionChanged: (() => void) | null;
  paired: boolean;
  readonly connection: { readonly url: string; readonly token: string };
}

const fake = vi.hoisted((): FakeHost => ({
  identity: vi.fn<() => Promise<DesktopComputerIdentity>>(),
  foreground: vi.fn<(scope: BackupScope | null) => Promise<void>>(),
  create: vi.fn<(input: ScopeInput) => Promise<BackupScope>>(),
  status: null,
  connectionChanged: null,
  paired: true,
  connection: { url: 'https://hub.test', token: `set_${'a'.repeat(64)}` },
}));

vi.mock('../../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof Platform>()),
  appPlatform: (): string => 'desktop',
  isNative: (): boolean => false,
  desktopBridge: (): {
    readonly computerIdentity: FakeHost['identity'];
    onServiceStatus(listener: () => void): () => void;
  } => ({
    computerIdentity: fake.identity,
    onServiceStatus(listener: () => void): () => void {
      fake.status = listener;
      return (): void => {
        fake.status = null;
      };
    },
  }),
}));
vi.mock('../../../../api/transport', () => ({ useConnection: vi.fn() }));
vi.mock('../../../../api/connection/connection', () => ({
  connectionState: {
    get: (): { readonly status: string; readonly connection: FakeHost['connection'] } => ({
      status: fake.paired ? 'paired' : 'removed',
      connection: fake.connection,
    }),
    subscribe(listener: () => void): () => void {
      fake.connectionChanged = listener;
      return (): void => {
        fake.connectionChanged = null;
      };
    },
  },
}));
vi.mock('./scope', () => ({ createBackupScope: fake.create }));
vi.mock('./sessions', () => ({ backupSessions: { setForeground: fake.foreground } }));
vi.mock('./platform-adapters', () => ({ backupAvailable: (): boolean => true }));
vi.mock('./background', () => ({ syncBackupSlot: vi.fn() }));

const COMPUTER = '00000000-0000-4000-8000-000000000004';
let off: (() => void) | undefined;

function openHost(): void {
  const store = new EntityStore();
  const state = phoneStoreState();
  const phone = state.tables.devices.rows[0];
  if (phone === undefined) throw new Error('Missing phone fixture');
  const computer = { ...phone, kind: 'computer' as const, id: COMPUTER };
  store.update(() => ({
    ...state,
    tables: { ...state.tables, devices: makeTable({ [COMPUTER]: computer }, [COMPUTER], 1) },
  }));
  off = watchBackupHost(store, fake.connection);
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.paired = true;
  backupStatus.set(INITIAL_BACKUP_STATUS);
  fake.identity.mockResolvedValue({ device_id: COMPUTER, machine_id: null });
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
afterEach(() => off?.());

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('desktop backup identity refresh', () => {
  it('keeps its current session and status through unchanged service status notifications', async () => {
    openHost();
    await settled();
    fake.foreground.mockClear();
    fake.create.mockClear();
    backupStatus.set({ ...INITIAL_BACKUP_STATUS, phase: 'paused', pauseReason: 'user' });
    const pending = deferred<DesktopComputerIdentity>();
    fake.identity.mockReturnValueOnce(pending.promise);
    fake.status?.();
    expect(fake.foreground).not.toHaveBeenCalled();
    expect(backupStatus.get().phase).toBe('paused');
    pending.resolve({ device_id: COMPUTER, machine_id: null });
    await settled();
    expect(fake.foreground).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
    expect(backupStatus.get().pauseReason).toBe('user');
  });

  it('stops the current session when the resolved computer identity is removed', async () => {
    openHost();
    await settled();
    fake.foreground.mockClear();
    fake.identity.mockResolvedValueOnce({ device_id: null, machine_id: null });
    fake.status?.();
    await settled();
    expect(fake.foreground).toHaveBeenCalledWith(null);
    expect(backupStatus.get()).toEqual(INITIAL_BACKUP_STATUS);
  });

  it('invalidates paired authority immediately while an identity check is pending', async () => {
    openHost();
    await settled();
    fake.foreground.mockClear();
    const pending = deferred<DesktopComputerIdentity>();
    fake.identity.mockReturnValueOnce(pending.promise);
    fake.status?.();
    fake.paired = false;
    fake.connectionChanged?.();
    expect(fake.foreground).toHaveBeenCalledWith(null);
    pending.resolve({ device_id: COMPUTER, machine_id: null });
    await settled();
    expect(fake.foreground.mock.calls.every(([scope]) => scope === null)).toBe(true);
  });
});
