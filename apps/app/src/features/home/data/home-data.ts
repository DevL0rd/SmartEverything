import { createContext, use, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { SceneRow } from '@smarteverything/domain';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useAvailability, useRows, useSession, useSettings } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { useActivity, type ActivityItem } from '../../activity';
import { useCameraEntries, type CameraEntry } from '../../cameras';
import { useComfortReadings, type ComfortMetric, type MetricReading } from '../../climate';
import { useHasScale } from '../../profiles';
import { useMyWatch } from '../../watches';
import { favouritesOf, sameFavourites, type Favourites } from '../model/favourites';
import { fitnessDayOf, type FitnessDay } from '../model/fitness-today';
import { deviceDigest, sameDigest, type DeviceDigest } from '../model/spotlight';
import { powerOf, samePower, type PowerUse } from '../model/power';
import { roomSummaries, sameRooms, type RoomSummary } from '../model/rooms';
import { sameSecurity, securityLines, type SecurityLine } from '../model/security';
import { homeSummary, type HomeSummary } from '../model/summary';

const HOME_METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25', 'co2'];

export interface HomeData {
  readonly digest: DeviceDigest;
  readonly readings: readonly MetricReading[];
  readonly power: PowerUse | null;
  readonly favourites: Favourites;
  readonly rooms: readonly RoomSummary[];
  readonly cameras: readonly CameraEntry[];
  readonly activity: readonly ActivityItem[];
  readonly scenes: readonly SceneRow[];
  readonly security: readonly SecurityLine[];
  readonly fitness: FitnessDay | null;
  readonly scale: boolean;
  readonly watch: boolean;
}

const DAY_MS = 86_400_000;

function useFitnessDay(): FitnessDay | null {
  const rows = useRows('health_daily');
  const zone = useSettings().time_zone;
  const now = useMinute();
  const profile = useSession().client.profile_id;
  const day = fitnessDayOf(rows, localDayKey(new Date(now), zone), profile);
  const yesterday = localDayKey(new Date(now - DAY_MS), zone);
  return day !== null && day.day >= yesterday ? day : null;
}

export function useHomeBasics(): Pick<HomeData, 'digest' | 'cameras'> {
  return { digest: useStoreSelector(deviceDigest, sameDigest), cameras: useCameraEntries() };
}

export function useHomeSummary(): HomeSummary {
  const readings = useComfortReadings(HOME_METRICS);
  const { offline } = useStoreSelector(deviceDigest, sameDigest);
  return homeSummary(readings, offline);
}

export function useHomeData(): HomeData {
  const { digest, cameras } = useHomeBasics();
  const readings = useComfortReadings(HOME_METRICS);
  const health = useAvailability().hasHealth;
  const fitness = useFitnessDay();
  return {
    digest,
    readings,
    power: useStoreSelector(powerOf, samePower),
    favourites: useStoreSelector(favouritesOf, sameFavourites),
    rooms: useStoreSelector(roomSummaries, sameRooms),
    cameras,
    activity: useActivity(),
    scenes: useRows('scenes'),
    security: useStoreSelector(securityLines, sameSecurity),
    fitness: health ? fitness : null,
    scale: useHasScale(),
    watch: useMyWatch() !== null,
  };
}

export interface HomeView extends HomeData {
  readonly spotlighted: ReadonlySet<string>;
}

export interface HomeViewStore {
  readonly get: () => HomeView;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (view: HomeView) => void;
}

export function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function sameView(left: HomeView, right: HomeView): boolean {
  return Object.entries(left).every(([key, value]) =>
    key === 'spotlighted'
      ? sameIds(left.spotlighted, right.spotlighted)
      : Object.is(value, Reflect.get(right, key)),
  );
}

function createHomeViewStore(initial: HomeView): HomeViewStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (view): void => {
      if (sameView(current, view)) {
        return;
      }
      current = view;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export function useHomeViewStore(view: HomeView): HomeViewStore {
  const [store] = useState(() => createHomeViewStore(view));
  useLayoutEffect(() => {
    store.set(view);
  }, [store, view]);
  return store;
}

export const HomeDataContext = createContext<HomeViewStore | null>(null);

class HomeDataMissingError extends Error {
  override readonly name = 'HomeDataMissingError';
}

export function useHome<T>(select: (view: HomeView) => T): T {
  const store = use(HomeDataContext);
  if (store === null) {
    throw new HomeDataMissingError('Home widgets must render inside the Home board.');
  }
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

const FREQUENT_AT_LEAST = 3;

export function unspotlighted(view: HomeView): readonly Device[] {
  return view.favourites.devices.filter((device) => !view.spotlighted.has(device.id));
}

export function availableWidgets(data: HomeView): ReadonlySet<string> {
  const entries: readonly (readonly [string, boolean])[] = [
    ['glance', data.readings.length > 0],
    ['scenes', data.scenes.length > 0],
    ['favourites', unspotlighted(data).length >= (data.favourites.chosen ? 1 : FREQUENT_AT_LEAST)],
    ['spotlight', data.digest.spotlightable.length > 0],
    ['rooms', data.rooms.length > 0],
    ['camera', data.cameras.length > 0],
    ['activity', data.activity.length > 0],
    ['energy', data.power !== null],
    ['security', data.security.length > 0],
    ['fitness-today', data.fitness !== null && data.fitness.figures.length > 0],
    ['body', data.scale],
    ['watch', data.watch],
    ['stress', data.watch],
  ];
  return new Set(entries.filter(([, shown]) => shown).map(([type]) => type));
}
