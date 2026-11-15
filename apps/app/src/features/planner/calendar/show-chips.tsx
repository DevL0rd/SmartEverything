import type { ReactNode } from 'react';
import { Checkbox } from '../../../components/checkbox';
import { CALENDAR_SHOWS, type CalendarShowKey } from '../settings/options';
import { useSavePrefs, type Prefs } from '../settings/preferences';

export function showChange(key: CalendarShowKey, on: boolean): Partial<Prefs['calendar']> {
  switch (key) {
    case 'show_tasks':
      return { show_tasks: on };
    case 'show_alarms':
      return { show_alarms: on };
    case 'show_sleep':
      return { show_sleep: on };
    case 'show_free_time':
      return { show_free_time: on };
  }
}

export function useFlipShow(): (key: CalendarShowKey) => void {
  const save = useSavePrefs('Show on the calendar');
  return (key) => {
    save((current) => ({ calendar: showChange(key, !current.calendar[key]) }));
  };
}

export function ShowChips({
  prefs,
  keys,
}: {
  readonly prefs: Prefs;
  readonly keys: readonly CalendarShowKey[];
}): ReactNode {
  const flip = useFlipShow();
  return CALENDAR_SHOWS.filter((show) => keys.includes(show.key)).map((show) => (
    <Checkbox
      key={show.key}
      label={show.title}
      icon={show.icon}
      checked={prefs.calendar[show.key]}
      onChange={() => {
        flip(show.key);
      }}
      className="pr-3"
    />
  ));
}

export const SHOW_KEYS: readonly CalendarShowKey[] = CALENDAR_SHOWS.map((show) => show.key);
