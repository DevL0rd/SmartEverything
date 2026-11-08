import { describe, expect, it } from 'vitest';
import { PREFS } from '../../../../store/prefs';
import { makeTable } from '../../../../store/state';
import { backupOwner, backupOwnerKey } from './host-state';
import { phoneStoreState } from './lifecycle-fixtures';

describe('backup phone scope selection', () => {
  it('selects only the phone enrolled by the current client', () => {
    const state = phoneStoreState();
    expect(backupOwner(state)).toMatchObject({
      clientId: state.session?.client.id,
      profileId: state.session?.client.profile_id,
      identity: { deviceId: state.tables.devices.rows[0]?.id, platform: 'android' },
    });
  });

  it('holds before snapshot/session/device ownership is known', () => {
    const state = phoneStoreState();
    expect(backupOwner({ ...state, loaded: false })).toBeNull();
    expect(backupOwner({ ...state, session: null })).toBeNull();
    const devices = state.tables.devices.rows.map((device) => ({
      ...device,
      details: { clientId: 'someone-else' },
    }));
    expect(
      backupOwner({
        ...state,
        tables: {
          ...state.tables,
          devices: makeTable(
            Object.fromEntries(devices.map((device) => [device.id, device])),
            devices.map((device) => device.id),
            1,
          ),
        },
      }),
    ).toBeNull();
  });

  it('holds invalid preferences and distinguishes a profile replacement', () => {
    const state = phoneStoreState();
    const key = PREFS.photosBackup.storageKey;
    const layout = {
      page: key,
      client_id: state.session?.client.id ?? null,
      profile_id: null,
      layout: { version: 999 },
      updated_at: '2026-11-01T00:00:00.000Z',
    };
    expect(
      backupOwner({
        ...state,
        tables: { ...state.tables, layouts: makeTable({ [key]: layout }, [key], 1) },
      }),
    ).toBeNull();
    const session = state.session;
    if (session === null) throw new Error('Missing fixture session');
    expect(
      backupOwnerKey({
        ...state,
        session: { ...session, client: { ...session.client, profile_id: 'another-person' } },
      }),
    ).not.toBe(backupOwnerKey(state));
  });
});

it('selects the canonical desktop computer instead of another phone of the same profile', () => {
  const state = phoneStoreState();
  const phone = state.tables.devices.rows[0];
  if (phone === undefined) throw new Error('Missing phone fixture');
  const computer = {
    ...phone,
    id: '00000000-0000-4000-8000-000000000004',
    kind: 'computer' as const,
    details: {},
  };
  const desktop = {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(
        { [phone.id]: phone, [computer.id]: computer },
        [phone.id, computer.id],
        1,
      ),
    },
  };
  expect(backupOwner(desktop, computer.id)).toMatchObject({
    identity: { deviceId: computer.id, platform: 'desktop' },
  });
  expect(backupOwner(desktop, null)).toBeNull();
  expect(backupOwner(desktop, phone.id)).toBeNull();
});
