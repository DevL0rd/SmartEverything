import { deferred } from './runner/deferred-fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_SESSION } from './runner/lifecycle-fixtures';
import { EntityStore } from '../../../store/entity-store';
import { prefOf, PREFS } from '../../../store/prefs';

const access = vi.hoisted(() => vi.fn());
const call = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const connection = vi.hoisted(() => ({ value: { status: 'paired' as const, connection: {} } }));
vi.mock('../../../api/connection/connection', () => ({
  connectionState: { get: (): typeof connection.value => connection.value },
}));
vi.mock('../../../api/transport', () => ({
  api: (): { readonly call: typeof call } => ({ call }),
}));
vi.mock('./runner/platform-adapters', () => ({
  backupAccessPort: (): { requestAccess: typeof access } => ({ requestAccess: access }),
}));

const { changeBackupEnabled } = await import('./activation');

function storeOf(): EntityStore {
  const store = new EntityStore();
  store.update((state) => ({ ...state, session: PHONE_SESSION }));
  return store;
}

beforeEach(() => {
  access.mockReset();
  call.mockClear();
  connection.value = { status: 'paired', connection: {} };
});

describe('backup enable permission intent', () => {
  it.each(['all', 'limited', 'none'])(
    'asks during activation and keeps the %s access state',
    async (granted) => {
      const store = storeOf();
      const permission = deferred<string>();
      access.mockReturnValue(permission.promise);
      const enabling = changeBackupEnabled(store, true);
      expect(access).toHaveBeenCalledOnce();
      expect(call).not.toHaveBeenCalled();
      permission.resolve(granted);
      await enabling;
      expect(prefOf(store.get(), PREFS.photosBackup)).toMatchObject({ value: { enabled: true } });
      expect(call).toHaveBeenCalledOnce();
    },
  );

  it('does not enable a different profile after a permission prompt', async () => {
    const store = storeOf();
    const permission = deferred<string>();
    access.mockReturnValue(permission.promise);
    const enabling = changeBackupEnabled(store, true);
    store.update((state) => ({ ...state, session: null }));
    permission.resolve('all');
    await enabling;
    expect(call).not.toHaveBeenCalled();
  });

  it('does not enable a replacement hub after a permission prompt', async () => {
    const store = storeOf();
    const permission = deferred<string>();
    access.mockReturnValue(permission.promise);
    const enabling = changeBackupEnabled(store, true);
    connection.value = { status: 'paired', connection: {} };
    permission.resolve('all');
    await enabling;
    expect(call).not.toHaveBeenCalled();
  });

  it('turns off without requesting photo access', async () => {
    const store = storeOf();
    await changeBackupEnabled(store, false);
    expect(access).not.toHaveBeenCalled();
    expect(prefOf(store.get(), PREFS.photosBackup)).toMatchObject({ value: { enabled: false } });
  });
});
