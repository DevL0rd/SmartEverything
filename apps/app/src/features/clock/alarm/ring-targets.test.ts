import { describe, expect, it, vi } from 'vitest';
import type { ClientRow } from '@smarteverything/domain';
vi.mock('../../planner', () => ({
  watchDotOf: (): null => null,
  WatchStateLines: (): null => null,
}));
vi.mock('../../../store/selectors', () => ({ useRows: (): never[] => [] }));
vi.mock('../../../store/store-context', () => ({ useStoreSelector: (): null => null }));
vi.mock('../../../components/flat-choice', () => ({ FlatChoice: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/tone', () => ({ STATUS_FILL: {} }));
vi.mock('../../device-visuals', () => ({ deviceIcon: (): string => 'monitor' }));
vi.mock('../../watches', () => ({ isLocalWatch: (): boolean => false }));

import { ringPlacesOf, type RingSources } from './ring-targets';

const PROFILE = 'person-1';

function client(id: string, change: Partial<ClientRow> = {}): ClientRow {
  return {
    id,
    name: id,
    platform: 'android',
    kind: 'phone',
    role: 'owner',
    built_in: false,
    profile_id: PROFILE,
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
    ...change,
  };
}

function sources(clients: readonly ClientRow[], selfId: string | null): RingSources {
  return { clients, devices: [], selfId, profileId: PROFILE };
}

const NO_ALARM = { targets: [], watch: [] };

describe('ringPlacesOf', () => {
  it('never offers the hub built-in client, which is no device a person owns', () => {
    const places = ringPlacesOf(
      sources(
        [
          client('hub', {
            name: 'This computer',
            platform: 'desktop',
            kind: 'computer',
            built_in: true,
          }),
          client('phone'),
        ],
        'phone',
      ),
      NO_ALARM,
    );
    expect(places.map((place) => place.name)).toEqual(['This phone']);
    expect(JSON.stringify(places)).not.toContain('hub');
  });

  it('offers a paired computer under its own name and never calls it this computer on a phone', () => {
    const places = ringPlacesOf(
      sources(
        [
          client('phone'),
          client('desk', { name: 'Desk PC', platform: 'desktop', kind: 'computer' }),
        ],
        'phone',
      ),
      NO_ALARM,
    );
    expect(places.map((place) => place.name)).toEqual(['This phone', 'Desk PC']);
  });

  it('skips browsers and clients of other people', () => {
    const places = ringPlacesOf(
      sources(
        [
          client('web', { platform: 'web', kind: 'browser' }),
          client('other', { profile_id: 'person-2' }),
        ],
        null,
      ),
      NO_ALARM,
    );
    expect(places).toEqual([]);
  });
});
