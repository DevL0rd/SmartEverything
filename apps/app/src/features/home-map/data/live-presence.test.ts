import { describe, expect, it, vi } from 'vitest';
import type { ShellyDevice } from '@smarteverything/shelly';
import { TRACK_TRAIL_MS } from '../../../components/house-map/overlays/model-types';
import { presenceFixture } from '../../../plugins/shelly-presence/presence-fixture';

vi.mock('../../../plugins/shelly-presence/presence-data', () => ({
  isPhysicalPresence: (device: { readonly external_id: string }): boolean =>
    device.external_id.startsWith('shelly-presence:'),
  useMapPresence: (): never => {
    throw new Error('not rendered');
  },
}));

const { IDLE_PRESENCE, advancePresence, zonesOf } = await import('./live-presence');

const PLACED = [{ deviceId: 'radar-device', externalId: 'shelly-presence:radar-1' }];

function framed(at: string, x: number): ShellyDevice {
  const base = presenceFixture();
  const [main, desk] = base.zones;
  if (main === undefined || desk === undefined) throw new Error('fixture zones');
  return {
    ...base,
    zones: [
      main,
      {
        ...desk,
        config: { ...desk.config, area: [[0, 0, 2, 2]] },
        status: { id: 201, value: true, num_objects: 1 },
      },
    ],
    tracks: [{ id: 7, x, y: 1, z: 0 }],
    tracksAt: at,
  };
}

const T0 = '2026-11-02T10:00:00.000Z';
const T1 = '2026-11-02T10:00:01.000Z';

describe('home map presence feed', () => {
  it('draws the enabled zones of a placed sensor without its main zone', () => {
    expect(zonesOf(framed(T0, 1))).toEqual([
      { id: 'shelly-presence:radar-1:201:0', area: [[0, 0, 2, 2]], occupied: true },
    ]);
  });

  it('leaves out a disabled zone', () => {
    const sensor = framed(T0, 1);
    const zones = sensor.zones.map((zone) => ({
      ...zone,
      config: { ...zone.config, enable: false },
    }));
    expect(zonesOf({ ...sensor, zones })).toEqual([]);
  });

  it('builds a track trail across frames while the tracking lease is held', () => {
    const first = advancePresence(IDLE_PRESENCE, PLACED, [framed(T0, 1)], true);
    const second = advancePresence(first, PLACED, [framed(T1, 2)], true);
    expect(second.trackingLease).toBe(true);
    expect(second.now).toBe(Date.parse(T1));
    expect(second.sensors[0]?.deviceId).toBe('radar-device');
    expect(second.sensors[0]?.tracks).toEqual([
      {
        id: '7',
        points: [
          { x: 1, y: 1, at: Date.parse(T0) },
          { x: 2, y: 1, at: Date.parse(T1) },
        ],
      },
    ]);
  });

  it('keeps the same feed object for the same frame and drops old points', () => {
    const first = advancePresence(IDLE_PRESENCE, PLACED, [framed(T0, 1)], true);
    expect(advancePresence(first, PLACED, [framed(T0, 1)], true)).toBe(first);
    const later = new Date(Date.parse(T0) + TRACK_TRAIL_MS + 1).toISOString();
    const aged = advancePresence(first, PLACED, [framed(later, 3)], true);
    expect(aged.sensors[0]?.tracks[0]?.points).toEqual([{ x: 3, y: 1, at: Date.parse(later) }]);
  });

  it('shows no tracks without a lease and nothing for a sensor that is not placed', () => {
    expect(
      advancePresence(IDLE_PRESENCE, PLACED, [framed(T0, 1)], false).sensors[0]?.tracks,
    ).toEqual([]);
    expect(advancePresence(IDLE_PRESENCE, [], [framed(T0, 1)], true).sensors).toEqual([]);
  });
});
