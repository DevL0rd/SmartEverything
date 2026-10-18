import { HISTORY_ROW } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { chipOf, lineOf, occupancyWindow, occupiedSegments } from './presence-face-model';
import { presenceFixture } from './presence-fixture';

const MAIN = 0;
const DESK = 1;

function withOccupancy(objects: number, desk: boolean): ReturnType<typeof presenceFixture> {
  const sensor = presenceFixture();
  return {
    ...sensor,
    zones: sensor.zones.map((zone, index) => ({
      ...zone,
      status: {
        id: zone.config.id,
        value: index === MAIN ? objects > 0 : desk,
        num_objects: index === MAIN ? objects : desk ? 1 : 0,
      },
    })),
  };
}

const row = (at: string, value: boolean | null): ReturnType<typeof HISTORY_ROW.parse> =>
  HISTORY_ROW.parse({
    id: 1,
    device_id: '00000000-0000-4000-8000-000000000001',
    capability: 'occupancy',
    value,
    observed_at: at,
  });

describe('presence face copy', () => {
  it('chips occupied rooms as info and empty rooms as neutral', () => {
    const occupied = withOccupancy(2, true);
    const main = occupied.zones[MAIN] ?? null;
    expect(chipOf(occupied, main)).toStrictEqual({ label: 'Occupied', tone: 'info' });
    const empty = withOccupancy(0, false);
    expect(chipOf(empty, empty.zones[MAIN] ?? null)).toStrictEqual({
      label: 'Empty',
      tone: 'neutral',
    });
  });

  it('chips an offline sensor as offline', () => {
    const offline = {
      ...withOccupancy(0, false),
      connection: { state: 'offline' as const, reason: null },
    };
    expect(chipOf(offline, offline.zones[MAIN] ?? null).label).toBe('Offline');
  });

  it('names the object count and the occupied zone', () => {
    const sensor = withOccupancy(2, true);
    const line = lineOf(sensor, sensor.zones[MAIN] ?? null, 'ready', false);
    expect(line.text).toContain('2 objects');
    expect(line.text).toContain(sensor.zones[DESK]?.config.name ?? 'missing');
    expect(line.tone).toBe('primary');
  });

  it('says there is no live view only when the sensor lacks it', () => {
    const sensor = withOccupancy(1, false);
    const zone = sensor.zones[MAIN] ?? null;
    expect(lineOf(sensor, zone, 'unsupported', false).text).toContain('No live view');
    expect(lineOf(sensor, zone, 'ready', false).text).not.toContain('No live view');
  });

  it('reports the one failure line when the lease could not start', () => {
    const sensor = withOccupancy(1, false);
    expect(lineOf(sensor, sensor.zones[MAIN] ?? null, 'ready', true)).toStrictEqual({
      text: 'Couldn’t start live view',
      tone: 'warning',
    });
  });

  it('shows the last map age for an offline sensor', () => {
    const sensor = {
      ...withOccupancy(0, false),
      connection: { state: 'offline' as const, reason: null },
    };
    expect(lineOf(sensor, sensor.zones[MAIN] ?? null, 'offline', false).text).toContain('Offline');
  });
});

describe('occupancy segments', () => {
  const T = (minute: number): string => `2026-10-18T10:${String(minute).padStart(2, '0')}:00.000Z`;

  it('turns changes into occupied spans and closes an open one at the end', () => {
    const end = Date.parse(T(50));
    const segments = occupiedSegments(
      [row(T(5), true), row(T(15), false), row(T(30), true), row(T(40), true)],
      end,
    );
    expect(segments).toStrictEqual([
      { start: Date.parse(T(5)), end: Date.parse(T(15)), state: 'occupied' },
      { start: Date.parse(T(30)), end, state: 'occupied' },
    ]);
  });

  it('treats unknown readings as the end of a span and sorts unordered rows', () => {
    const segments = occupiedSegments([row(T(20), null), row(T(10), true)], Date.parse(T(50)));
    expect(segments).toStrictEqual([
      { start: Date.parse(T(10)), end: Date.parse(T(20)), state: 'occupied' },
    ]);
  });

  it('has no spans without rows', () => {
    expect(occupiedSegments([], 1)).toStrictEqual([]);
  });

  it('windows the last 24 hours', () => {
    expect(occupancyWindow(86_400_000 * 3)).toStrictEqual({
      from: 86_400_000 * 2,
      to: 86_400_000 * 3,
    });
  });
});
