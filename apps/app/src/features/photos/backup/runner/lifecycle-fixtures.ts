import { DEVICE_ROW, SESSION } from '@smarteverything/domain';
import { deviceOf, emptyState, makeTable, type StoreState } from '../../../../store/state';

export const PHONE_SESSION = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-11-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-11-01T00:00:00.000Z', cameras: 'running' },
});

export function phoneStoreState(): StoreState {
  const state = emptyState();
  const phone = deviceOf(
    DEVICE_ROW.parse({
      id: '00000000-0000-4000-8000-000000000003',
      provider: 'local',
      external_id: 'phone',
      parent_id: null,
      kind: 'phone',
      name: 'Test phone',
      display_name: null,
      model: 'Test',
      manufacturer: 'Test',
      provider_room: null,
      room_id: null,
      online: true,
      capabilities: [],
      details: { clientId: PHONE_SESSION.client.id },
      hidden: false,
      favourite: false,
      position: 0,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    }),
  );
  return {
    ...state,
    loaded: true,
    session: PHONE_SESSION,
    tables: { ...state.tables, devices: makeTable({ [phone.id]: phone }, [phone.id], 1) },
  };
}
