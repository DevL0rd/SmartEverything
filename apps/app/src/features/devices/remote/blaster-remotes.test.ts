import { describe, expect, it } from 'vitest';
import { EMPTY_IR_REMOTE_STATE, SETTINGS_ROW, type IrRemoteRow } from '@smarteverything/domain';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { makeTable } from '../../../store/state';
import { latestSend, remotesOfBlaster } from './blaster-remotes';

const BLASTER = '00000000-0000-4000-8000-0000000000b1';

function learned(id: string, name: string, category: string): IrRemoteRow {
  return {
    id,
    blaster_id: BLASTER,
    name,
    category,
    brand: null,
    created_at: '2026-10-18T10:00:00.000Z',
  };
}

describe('remotesOfBlaster', () => {
  it('lists the library remotes under the blaster and its learned remotes with their category', () => {
    const devices = [
      deviceFixture(0, { id: BLASTER, kind: 'ir_blaster' }),
      deviceFixture(1, { id: 'ac', kind: 'ir_remote', name: 'Living room AC', parent_id: BLASTER }),
      deviceFixture(2, { id: 'far', kind: 'ir_remote', name: 'Far TV', parent_id: 'elsewhere' }),
    ];
    const base = stateFixture(devices, {});
    const rows = [learned('fan', 'Bedroom fan', 'fan')];
    const state = {
      ...base,
      tables: {
        ...base.tables,
        ir_remotes: makeTable(
          Object.fromEntries(rows.map((row) => [row.id, row])),
          rows.map((row) => row.id),
          1,
        ),
      },
    };
    expect(
      remotesOfBlaster(state, BLASTER).map((remote) => [remote.name, remote.category]),
    ).toEqual([
      ['Living room AC', 'ac'],
      ['Bedroom fan', 'fan'],
    ]);
  });

  it('is empty for a blaster with no remotes', () => {
    const state = stateFixture([deviceFixture(0, { id: BLASTER, kind: 'ir_blaster' })], {});
    expect(remotesOfBlaster(state, BLASTER)).toEqual([]);
  });
});

describe('latestSend', () => {
  const remotes = [
    { id: 'a', name: 'A', category: 'ac', icon: 'snowflake' },
    { id: 'b', name: 'B', category: 'fan', icon: 'fan' },
  ] as const;

  function settingsWith(
    sent: Readonly<Record<string, string | null>>,
  ): Pick<ReturnType<typeof stateFixture>, 'settings'> {
    return {
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
        ir_remotes: Object.fromEntries(
          Object.entries(sent).map(([id, at]) => [id, { ...EMPTY_IR_REMOTE_STATE, sentAt: at }]),
        ),
      }),
    };
  }

  it('finds the newest send among the blaster’s remotes', () => {
    expect(
      latestSend(
        remotes,
        settingsWith({
          a: '2026-10-18T10:00:00.000Z',
          b: '2026-10-18T11:00:00.000Z',
          z: '2026-10-18T23:00:00.000Z',
        }),
      ),
    ).toBe('2026-10-18T11:00:00.000Z');
  });

  it('is null when nothing was sent or the home settings are not loaded yet', () => {
    expect(latestSend(remotes, settingsWith({ a: null }))).toBeNull();
    expect(latestSend([], settingsWith({}))).toBeNull();
    expect(latestSend(remotes, { settings: null })).toBeNull();
  });
});
