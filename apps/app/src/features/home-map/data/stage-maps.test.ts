import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_SUMMARY, type HomeMapSummary } from '@smarteverything/domain';

vi.mock('./home-map-query', () => ({
  useHomeMap: (): never => {
    throw new Error('not rendered');
  },
}));
vi.mock('./map-set-query', () => ({
  useHomeMapSet: (): never => {
    throw new Error('not rendered');
  },
}));
vi.mock('../model/map-choice', () => ({
  useMapChoice: (): never => {
    throw new Error('not rendered');
  },
}));

const { chosenQueryId, stageMapsOf } = await import('./stage-maps');
const { homeMapSceneLive } = await import('./map-scene');

function summary(id: string, isDefault: boolean): HomeMapSummary {
  return HOME_MAP_SUMMARY.parse({
    id,
    name: `Map ${id}`,
    revision: 1,
    floorNames: ['Ground'],
    roomCount: 2,
    isDefault,
    position: 0,
    fedBy: [],
    hasScan: false,
    updatedAt: '2026-10-25T00:00:00.000Z',
  });
}

describe('stage map switcher', () => {
  it('offers every map of the set with the shown one chosen', () => {
    const onChange = vi.fn();
    const maps = stageMapsOf([summary('cabin', true), summary('flat', false)], 'flat', onChange);
    expect(maps?.options).toEqual([
      { id: 'cabin', label: 'Map cabin' },
      { id: 'flat', label: 'Map flat' },
    ]);
    expect(maps?.value).toBe('flat');
    maps?.onChange('cabin');
    expect(onChange).toHaveBeenCalledWith('cabin');
  });

  it('offers nothing until the set and the shown map are known', () => {
    expect(stageMapsOf(null, 'flat', vi.fn())).toBeUndefined();
    expect(stageMapsOf([summary('cabin', true)], null, vi.fn())).toBeUndefined();
  });

  it('reads the default map through the default query and any other map by its id', () => {
    expect(chosenQueryId(null)).toBeUndefined();
    expect(chosenQueryId(summary('cabin', true))).toBeUndefined();
    expect(chosenQueryId(summary('flat', false))).toBe('flat');
  });
});

describe('home map scene names', () => {
  it('names placements by the device label and keeps the device kind', () => {
    const live = homeMapSceneLive(
      [{ id: 'kitchen', name: 'Kitchen' }],
      [{ id: 'lamp', label: 'Desk lamp', kind: 'light' }],
    );
    expect(live.device?.('lamp')).toEqual({ name: 'Desk lamp', kind: 'light' });
    expect(live.device?.('gone')).toBeNull();
    expect(live.homeRoomName?.('kitchen')).toBe('Kitchen');
    expect(live.homeRoomName?.('gone')).toBeNull();
  });
});
