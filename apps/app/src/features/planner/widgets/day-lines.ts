import type { PlannerColourKey, PlannerDay, PlannerOccurrenceView } from '@smarteverything/domain';
import { useRows, useSettings } from '../../../store/selectors';
import {
  useClockFormat,
  useInstantClock,
  type InstantClock,
} from '../../clock/format/clock-format';
import { usePlannerProfile } from '../data/assignment';
import { usePlannerCollections, usePlannerItems, usePlannerPreferences } from '../data';
import { LIST_DOT } from '../item/composer-tokens';
import { dayStripOf, type DayStripModel } from '../today/day-strip-model';
import { occurrenceKeyOf, riverRowsOf, riverTimeOf } from '../today/river-model';

export const NO_HIDDEN: ReadonlySet<string> = new Set();

function dotOf(colour: PlannerColourKey | null): string {
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

export interface DayLine {
  readonly key: string;
  readonly time: string;
  readonly title: string;
  readonly dot: string;
  readonly missed: boolean;
  readonly spoken: string;
}

function missedLineOf(
  occurrence: PlannerOccurrenceView,
  timeZone: string,
  instant: InstantClock,
): DayLine {
  const time = riverTimeOf(occurrence, timeZone, instant);
  return {
    key: `missed:${occurrenceKeyOf(occurrence)}`,
    time,
    title: occurrence.title,
    dot: 'bg-critical',
    missed: true,
    spoken: `Missed, ${time}, ${occurrence.title}`,
  };
}

export function useDayLines(
  day: PlannerDay,
  lens: PlannerOccurrenceView | null,
): readonly DayLine[] {
  const items = usePlannerItems(null);
  const collections = usePlannerCollections(null);
  const guests = useRows('planner_guests');
  const me = usePlannerProfile(null);
  const instant = useInstantClock();
  const rows = riverRowsOf({
    day,
    collections,
    items,
    hidden: NO_HIDDEN,
    lens,
    guests,
    me,
    instant,
  });
  return [
    ...day.missed.map((occurrence) => missedLineOf(occurrence, day.time_zone, instant)),
    ...rows.map((row): DayLine => ({
      key: row.key,
      time: row.time,
      title: row.title,
      dot: dotOf(row.colour),
      missed: false,
      spoken: row.spoken,
    })),
  ];
}

export function useStripModel(day: PlannerDay): DayStripModel {
  const collections = usePlannerCollections(null);
  const preferences = usePlannerPreferences(null).data;
  const { latitude, longitude } = useSettings();
  return dayStripOf({
    day,
    collections,
    place: latitude === null || longitude === null ? null : { latitude, longitude },
    showSleep: preferences?.day_planner.show_sleep === true,
    format: useClockFormat(),
  });
}
