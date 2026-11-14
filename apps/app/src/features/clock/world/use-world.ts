import { useState } from 'react';
import type { MenuItem } from '../../../components/menu';
import { localDayKey } from '../../../format/time';
import { useSettings } from '../../../store/selectors';
import { usePlannerPreferences } from '../../planner/data';
import { useSavePrefs } from '../../planner/settings/preferences';
import { useHubOffline } from '../frame/hub-status';
import {
  addedClock,
  citiesOf,
  homePointOf,
  movedClock,
  removedClock,
  type WorldCity,
  type WorldClock,
} from './cities';
import {
  hourPlanOf,
  markerSummaryOf,
  nextHourOf,
  type HomeDay,
  type HourPlan,
} from './find-a-time';
import { cityMenuOf } from './city-menu';
import type { HourPick } from './hour-grid';

const NO_CLOCKS: readonly WorldClock[] = [];

export interface WorldModel {
  readonly cities: readonly WorldCity[];
  readonly clocks: readonly WorldClock[];
  readonly home: HomeDay;
  readonly plan: HourPlan | null;
  readonly offline: boolean;
  readonly add: (zone: string) => void;
  readonly menuOf: (city: WorldCity) => readonly MenuItem[];
}

function useClockEdits(offline: boolean): {
  readonly add: (zone: string) => void;
  readonly menuOf: (city: WorldCity, clocks: readonly WorldClock[]) => readonly MenuItem[];
} {
  const save = useSavePrefs('World clocks');
  const write = (edit: (clocks: readonly WorldClock[]) => readonly WorldClock[]): void => {
    save((prefs) => ({ clock: { world_clocks: edit(prefs.clock.world_clocks) } }));
  };
  const actions = {
    move: (zone: string, by: -1 | 1): void => {
      write((clocks) => movedClock(clocks, zone, by));
    },
    remove: (zone: string): void => {
      write((clocks) => removedClock(clocks, zone));
    },
  };
  return {
    add: (zone): void => {
      write((clocks) => addedClock(clocks, zone));
    },
    menuOf: (city, clocks) => cityMenuOf(city, clocks, offline, actions),
  };
}

export function useWorld(now: number): WorldModel {
  const settings = useSettings();
  const prefs = usePlannerPreferences(null).data;
  const offline = useHubOffline();
  const edits = useClockEdits(offline);
  const clocks = prefs?.clock.world_clocks ?? NO_CLOCKS;
  const zone = settings.time_zone;
  return {
    cities: citiesOf({ zone, point: homePointOf(settings) }, clocks),
    clocks,
    home: { day: localDayKey(now, zone), zone },
    plan: prefs === undefined ? null : hourPlanOf(prefs.general),
    offline,
    add: edits.add,
    menuOf: (city) => edits.menuOf(city, clocks),
  };
}

export function useHourPick(now: number, world: WorldModel): HourPick {
  const [chosen, setChosen] = useState<number | null>(null);
  const hour = chosen ?? nextHourOf(now, world.home.zone);
  return {
    hour,
    summary: markerSummaryOf(world.cities, hour, world.home),
    onHour: setChosen,
  };
}
