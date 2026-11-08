import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_FEED, HOME_MAP_MAP_ID, type HomeMapFeed } from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';

interface Robot {
  readonly unfedMaps: boolean;
  readonly working: boolean;
  readonly onImport: () => void;
  readonly onQuickMapping: () => void;
}

interface Probe {
  readonly feeds: HomeMapFeed[];
  key: string | undefined;
  accepted: boolean;
  readonly pushed: unknown[];
  readonly sent: (readonly unknown[])[];
  readonly robots: Robot[];
  readonly maps: unknown[];
}

const probe = vi.hoisted(() => {
  const state: Probe = {
    feeds: [],
    key: 'raw:action.2.17',
    accepted: true,
    pushed: [],
    sent: [],
    robots: [],
    maps: [],
  };
  return state;
});

vi.mock('expo-router', () => ({
  useRouter: (): { push: (target: unknown) => void } => ({
    push: (target): void => {
      probe.pushed.push(target);
    },
  }),
}));
vi.mock('../../../../components/confirm-store', () => ({
  confirm: (): Promise<boolean> => Promise.resolve(probe.accepted),
}));
vi.mock('../../../../store/store-context', () => ({
  useLedger: (): { send: (...args: readonly unknown[]) => Promise<void> } => ({
    send: (...args): Promise<void> => {
      probe.sent.push(args);
      return Promise.resolve();
    },
  }),
}));
vi.mock('../../../home-map/data/map-set-query', () => ({
  useRobotMapFeeds: (): readonly HomeMapFeed[] => probe.feeds,
}));
vi.mock('../../../home-map/components/robot-map-feed', () => ({
  robotMapsHref: (): string => '/settings/home/maps/robot-maps',
}));
vi.mock('../../../home-map/components/stage/no-map-entry', () => ({
  NoMapEntry: ({ map, robot }: { readonly map: unknown; readonly robot: Robot }): null => {
    probe.maps.push(map);
    probe.robots.push(robot);
    return null;
  },
}));
vi.mock('../data/use-vacuum', () => ({
  useVacuum: (): { keyOf: () => string | undefined } => ({ keyOf: () => probe.key }),
}));

const { VacuumNoMap, robotHasUnfedMaps } = await import('./vacuum-no-map');

const device = { ...deviceFixture(0), id: '00000000-0000-4000-8000-000000000001' };
const HOME = { id: HOME_MAP_MAP_ID.parse('home'), name: 'Home' };

function feed(deviceId: string, fed: boolean): HomeMapFeed {
  return HOME_MAP_FEED.parse({
    deviceId,
    robotMapId: 1,
    robotMapName: 'Ground',
    isCurrent: true,
    target: fed ? { mapId: 'home', floorId: 'ground' } : null,
  });
}

function robotOf(working: boolean): Robot {
  probe.robots.length = 0;
  renderToStaticMarkup(createElement(VacuumNoMap, { device, map: HOME, working }));
  const robot = probe.robots.at(-1);
  if (robot === undefined) throw new Error('no robot extras');
  return robot;
}

describe('robot maps that feed nothing', () => {
  it('counts only this robot maps without a floor', () => {
    const other = '00000000-0000-4000-8000-000000000009';
    expect(robotHasUnfedMaps(null, device.id)).toBe(false);
    expect(robotHasUnfedMaps([feed(device.id, true)], device.id)).toBe(false);
    expect(robotHasUnfedMaps([feed(other, false)], device.id)).toBe(false);
    expect(robotHasUnfedMaps([feed(device.id, false)], device.id)).toBe(true);
  });
});

describe('vacuum page without a drawn map', () => {
  it('shows Create a map for the map with Use the robot map opening Robot maps', () => {
    probe.feeds.splice(0, probe.feeds.length, feed(device.id, false));
    const robot = robotOf(false);
    expect(probe.maps.at(-1)).toBe(HOME);
    expect(robot.unfedMaps).toBe(true);
    robot.onImport();
    expect(probe.pushed.at(-1)).toBe('/settings/home/maps/robot-maps');
  });

  it('maps with the robot after the confirm, only while it is not working', async () => {
    probe.feeds.length = 0;
    probe.sent.length = 0;
    expect(robotOf(true).working).toBe(true);
    const robot = robotOf(false);
    expect(robot).toMatchObject({ unfedMaps: false, working: false });
    probe.accepted = false;
    robot.onQuickMapping();
    await Promise.resolve();
    expect(probe.sent).toHaveLength(0);
    probe.accepted = true;
    robot.onQuickMapping();
    await vi.waitFor(() => {
      expect(probe.sent).toEqual([[device, 'raw:action.2.17', null]]);
    });
  });

  it('never offers mapping on a robot that cannot build a map', () => {
    probe.key = undefined;
    expect(robotOf(false).working).toBe(true);
    probe.key = 'raw:action.2.17';
  });
});
