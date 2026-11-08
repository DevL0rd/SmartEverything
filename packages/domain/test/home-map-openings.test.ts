import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import {
  openingChanges,
  openingLiveState,
  openingLiveStates,
  type HomeMapContactReading,
  type HomeMapOpeningLiveState,
} from '../src/home-map-openings';
import {
  HOME_MAP_OPENING,
  HOME_MAP_OPENING_ID,
  HOME_MAP_OPENING_WRITE,
} from '../src/home-map-elements';

const SENSOR = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const OTHER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const readings = (reading: HomeMapContactReading | null): Map<string, HomeMapContactReading> =>
  new Map<string, HomeMapContactReading>(reading ? [[SENSOR, reading]] : []);

const bound = { contactDeviceId: SENSOR };

describe('opening live state', () => {
  it('reads closed and open from the contact reading', () => {
    expect(openingLiveState(bound, readings({ online: true, open: false }))).toBe('closed');
    expect(openingLiveState(bound, readings({ online: true, open: true }))).toBe('open');
  });

  it('is tilted only from a reading that reports tilt', () => {
    expect(openingLiveState(bound, readings({ online: true, open: true }))).toBe('open');
    expect(openingLiveState(bound, readings({ online: true, open: true, tilted: false }))).toBe(
      'open',
    );
    expect(openingLiveState(bound, readings({ online: true, open: true, tilted: null }))).toBe(
      'open',
    );
    expect(openingLiveState(bound, readings({ online: true, open: true, tilted: true }))).toBe(
      'tilted',
    );
  });

  it('is unknown when the sensor is offline, silent or has no reading', () => {
    expect(openingLiveState(bound, readings({ online: false, open: true }))).toBe('unknown');
    expect(openingLiveState(bound, readings({ online: true, open: null }))).toBe('unknown');
    expect(openingLiveState(bound, readings(null))).toBe('unknown');
    expect(openingLiveState(bound, readings({ online: false, open: false, tilted: true }))).toBe(
      'unknown',
    );
  });

  it('draws an unbound opening closed and ignores other devices', () => {
    expect(
      openingLiveState({ contactDeviceId: null }, readings({ online: true, open: true })),
    ).toBe('closed');
    expect(
      openingLiveState({ contactDeviceId: OTHER }, readings({ online: true, open: true })),
    ).toBe('unknown');
  });

  it('builds the state of every opening by id', () => {
    const states = openingLiveStates(
      [
        { id: HOME_MAP_OPENING_ID.parse('a'), contactDeviceId: SENSOR },
        { id: HOME_MAP_OPENING_ID.parse('b'), contactDeviceId: null },
      ],
      readings({ online: true, open: true }),
    );
    expect([...states]).toEqual([
      ['a', 'open'],
      ['b', 'closed'],
    ]);
  });
});

describe('opening changes', () => {
  const states = (
    ...entries: [string, HomeMapOpeningLiveState][]
  ): Map<string, HomeMapOpeningLiveState> => new Map(entries);

  it('has no change event on the first draw', () => {
    expect(openingChanges(null, states(['a', 'open']))).toEqual([]);
  });

  it('reports each opening whose state changed, once', () => {
    const before = states(['a', 'closed'], ['b', 'open'], ['c', 'closed']);
    const after = states(['a', 'open'], ['b', 'open'], ['c', 'tilted']);
    expect(openingChanges(before, after)).toEqual([
      { id: 'a', from: 'closed', to: 'open' },
      { id: 'c', from: 'closed', to: 'tilted' },
    ]);
    expect(openingChanges(after, after)).toEqual([]);
  });

  it('ignores openings that appear and readings that arrive or vanish', () => {
    expect(openingChanges(states(['a', 'closed']), states(['a', 'closed'], ['b', 'open']))).toEqual(
      [],
    );
    expect(openingChanges(states(['a', 'unknown']), states(['a', 'open']))).toEqual([]);
    expect(openingChanges(states(['a', 'open']), states(['a', 'unknown']))).toEqual([]);
  });
});

describe('opening schema', () => {
  const opening = {
    id: 'o1',
    wallId: 'w1',
    offset: 1,
    width: 0.9,
    kind: 'window',
    sillHeight: 0.9,
    headHeight: 2.1,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: SENSOR,
    lockDeviceId: null,
    origin: { kind: 'hand' },
  };

  it('keeps opens optional and accepts every way to open', () => {
    expect(HOME_MAP_OPENING_WRITE.safeParse(opening).success).toBe(true);
    for (const opens of ['side_hung', 'tilt_turn', 'sliding', 'fixed', 'swing']) {
      expect(HOME_MAP_OPENING_WRITE.parse({ ...opening, opens }).opens).toBe(opens);
    }
    expect(HOME_MAP_OPENING_WRITE.safeParse({ ...opening, opens: 'folding' }).success).toBe(false);
    expect(HOME_MAP_OPENING.parse({ ...opening, future: 1 })).toMatchObject({ future: 1 });
  });

  it('exports the modules through the domain index', () => {
    expect(domain.openingLiveState).toBe(openingLiveState);
  });
});
