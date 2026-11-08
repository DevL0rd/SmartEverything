import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_MAP_ID } from '@smarteverything/domain';

const probe = vi.hoisted(() => ({
  devices: new Array<{ readonly kind: string }>(),
  created: new Array<string | undefined>(),
  shown: new Array<Record<string, unknown>>(),
}));

const CREATE = vi.hoisted(() => ({
  create: (): void => undefined,
  busy: false,
  offline: false,
  problem: null,
}));

vi.mock('../../../../store/selectors', () => ({
  useDevices: (): readonly { readonly kind: string }[] => probe.devices,
}));
vi.mock('../../model/create-map', () => ({
  useCreateMap: (mapId: string | undefined): typeof CREATE => {
    probe.created.push(mapId);
    return CREATE;
  },
}));
vi.mock('./no-map-state', () => ({
  NoMapState: (props: Record<string, unknown>): null => {
    probe.shown.push(props);
    return null;
  },
}));

const { NoMapEntry, mapIsBlank } = await import('./no-map-entry');

function roomsOf(...counts: readonly number[]): {
  readonly floors: readonly { readonly rooms: readonly unknown[] }[];
} {
  return { floors: counts.map((count) => ({ rooms: Array.from({ length: count }, () => ({})) })) };
}

function shown(props: Parameters<typeof NoMapEntry>[0]): Record<string, unknown> | undefined {
  probe.shown.length = 0;
  renderToStaticMarkup(createElement(NoMapEntry, props));
  return probe.shown.at(-1);
}

const CABIN = { id: HOME_MAP_MAP_ID.parse('cabin'), name: 'Cabin' };

describe('blank map', () => {
  it('is a loaded map with nothing drawn on any floor, never a map still loading', () => {
    expect(mapIsBlank(null)).toBe(false);
    expect(mapIsBlank(roomsOf())).toBe(true);
    expect(mapIsBlank(roomsOf(0, 0))).toBe(true);
    expect(mapIsBlank(roomsOf(0, 2))).toBe(false);
  });
});

describe('no-map entry', () => {
  it('creates content for the shown map and names it', () => {
    probe.devices.splice(0, probe.devices.length, { kind: 'light' });
    const props = shown({ map: CABIN, className: 'rounded-none' });
    expect(probe.created.at(-1)).toBe('cabin');
    expect(props).toMatchObject({
      mapName: 'Cabin',
      hasVacuum: false,
      create: CREATE,
      className: 'rounded-none',
    });
  });

  it('falls back to the default map with no maps at all and tells a vacuum owner', () => {
    probe.devices.splice(0, probe.devices.length, { kind: 'vacuum' });
    const props = shown({ map: null });
    expect(probe.created.at(-1)).toBeUndefined();
    expect(props).toMatchObject({ mapName: null, hasVacuum: true });
  });

  it('passes the robot extras through', () => {
    const robot = { unfedMaps: true, working: false, onImport: vi.fn(), onQuickMapping: vi.fn() };
    expect(shown({ map: CABIN, robot })?.['robot']).toBe(robot);
  });
});
