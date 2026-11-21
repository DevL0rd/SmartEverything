import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ROW, SETTINGS_ROW } from '@smarteverything/domain';
import { EntityStore } from './entity-store';
import { applyChange } from './live-reducers';

const api = vi.hoisted(() => ({
  updateHome: vi.fn<() => Promise<void>>(),
  changeClientRole: vi.fn<() => Promise<void>>(),
  removeClient: vi.fn<() => Promise<void>>(),
  setClientProfile: vi.fn<() => Promise<void>>(),
}));

vi.mock('../api/settings', () => api);

const { unpairClient, writeClientRole, writeHome } = await import('./home-writes');

const CLIENT = CLIENT_ROW.parse({
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Tablet',
  platform: 'android',
  role: 'member',
  built_in: false,
  profile_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  last_seen_at: null,
});

function homeStore(): EntityStore {
  const store = new EntityStore();
  store.update((state) =>
    applyChange(
      {
        ...state,
        settings: SETTINGS_ROW.parse({
          home_name: 'Home',
          time_zone: 'UTC',
          latitude: null,
          longitude: null,
          public_url: null,
          public_url_checked_at: null,
          public_url_verified_at: null,
          public_url_error: null,
          ice_servers: [],
          webrtc_candidates: [],
          push_project_id: null,
          updated_at: '2026-10-18T10:00:00.000Z',
        }),
      },
      { type: 'change', table: 'clients', operation: 'INSERT', record: CLIENT, oldRecord: null },
    ),
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('home and member writes', () => {
  it('shows the new home name at once and keeps it when the Hub accepts', async () => {
    const store = homeStore();
    api.updateHome.mockImplementationOnce(() => {
      expect(store.get().settings?.home_name).toBe('Cabin');
      return Promise.resolve();
    });
    await writeHome(store, { home_name: 'Cabin' });
    expect(store.get().settings?.home_name).toBe('Cabin');
  });

  it('puts the old time zone back when the Hub refuses', async () => {
    const store = homeStore();
    api.updateHome.mockRejectedValueOnce(new Error('refused'));
    await expect(writeHome(store, { time_zone: 'Asia/Bangkok' })).rejects.toThrow('refused');
    expect(store.get().settings?.time_zone).toBe('UTC');
  });

  it('switches a role at once and rolls it back on refusal', async () => {
    const store = homeStore();
    let refuse = (_error: Error): void => {
      throw new Error('Expected a pending role change');
    };
    api.changeClientRole.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const write = writeClientRole(store, CLIENT, 'owner');
    expect(store.get().tables.clients.byId[CLIENT.id]?.role).toBe('owner');
    refuse(new Error('last owner'));
    await expect(write).rejects.toThrow('last owner');
    expect(store.get().tables.clients.byId[CLIENT.id]?.role).toBe('member');
  });

  it('removes an unpaired device at once and brings it back when unpairing fails', async () => {
    const store = homeStore();
    api.removeClient.mockRejectedValueOnce(new Error('offline'));
    const write = unpairClient(store, CLIENT);
    expect(store.get().tables.clients.byId[CLIENT.id]).toBeUndefined();
    await expect(write).rejects.toThrow('offline');
    expect(store.get().tables.clients.byId[CLIENT.id]?.name).toBe('Tablet');
  });
});
