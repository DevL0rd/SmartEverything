import { createContext, use } from 'react';
import type { SceneRow } from '@smarteverything/domain';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import {
  useAvailability,
  useDevices,
  useRows,
  useSession,
  useSettings,
} from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { useActivity, type ActivityItem } from '../../activity';
import { useCameraEntries, type CameraEntry } from '../../cameras';
import { useComfortReadings, type ComfortMetric, type MetricReading } from '../../climate';
import { useHasScale } from '../../profiles';
import { useMyWatch } from '../../watches';
import { favouritesOf, sameFavourites, type Favourites } from '../model/favourites';
import { fitnessDayOf, type FitnessDay } from '../model/fitness-today';
import { spotlightable } from '../model/spotlight';
import { powerOf, samePower, type PowerUse } from '../model/power';
import { roomSummaries, sameRooms, type RoomSummary } from '../model/rooms';
import { sameSecurity, securityLines, type SecurityLine } from '../model/security';
import { homeSummary, type HomeSummary } from '../model/summary';

const HOME_METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25', 'co2'];

export interface HomeData {
  readonly devices: readonly Device[];
  readonly readings: readonly MetricReading[];
  readonly power: PowerUse | null;
  readonly summary: HomeSummary;
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

export function useHomeData(): HomeData {
  const devices = useDevices();
  const readings = useComfortReadings(HOME_METRICS);
  const health = useAvailability().hasHealth;
  const fitness = useFitnessDay();
  return {
    devices,
    readings,
    power: useStoreSelector(powerOf, samePower),
    summary: homeSummary(readings, devices),
    favourites: useStoreSelector(favouritesOf, sameFavourites),
    rooms: useStoreSelector(roomSummaries, sameRooms),
    cameras: useCameraEntries(),
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

export const HomeDataContext = createContext<HomeView | null>(null);

class HomeDataMissingError extends Error {
  override readonly name = 'HomeDataMissingError';
}

export function useHome(): HomeView {
  const data = use(HomeDataContext);
  if (data === null) {
    throw new HomeDataMissingError('Home widgets must render inside the Home board.');
  }
  return data;
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
    ['spotlight', data.devices.some(spotlightable)],
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
