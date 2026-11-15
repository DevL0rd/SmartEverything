import type { PlannerCollectionRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { useMemo } from 'react';
import type { PlannerPerson } from '../data';
import {
  useGeneratedItems,
  useMyResponses,
  useViewerCalendars,
  type ResponseOf,
} from '../data/sharing';
import { canEditItems, eventLookOf, type EventLook, type ViewerCalendar } from './calendars-model';

export interface CalendarLooks {
  readonly collections: readonly PlannerCollectionRow[];
  readonly lookOf: (occurrence: PlannerOccurrenceView) => EventLook;
  readonly readOnlyOf: (occurrence: PlannerOccurrenceView) => boolean;
  readonly shown: (
    occurrences: readonly PlannerOccurrenceView[],
  ) => readonly PlannerOccurrenceView[];
}

export interface LookInput {
  readonly calendars: readonly ViewerCalendar[];
  readonly responseOf: ResponseOf;
  readonly generated: ReadonlySet<string>;
}

export function calendarLooksOf(input: LookInput): CalendarLooks {
  const byId = new Map(input.calendars.map((calendar) => [calendar.row.id, calendar] as const));
  const lookOf = (occurrence: PlannerOccurrenceView): EventLook =>
    eventLookOf(byId.get(occurrence.collection_id)?.row, input.responseOf(occurrence.item_id));
  return {
    collections: input.calendars.map((calendar) => calendar.row),
    lookOf,
    readOnlyOf: (occurrence): boolean => {
      const calendar = byId.get(occurrence.collection_id);
      if (calendar === undefined || !canEditItems(calendar)) return true;
      return input.generated.has(occurrence.item_id);
    },
    shown: (occurrences): readonly PlannerOccurrenceView[] =>
      occurrences.filter((occurrence) => lookOf(occurrence) !== 'declined'),
  };
}

export function useCalendarLooks(person: PlannerPerson): CalendarLooks {
  const calendars = useViewerCalendars(person);
  const responseOf = useMyResponses(person);
  const generated = useGeneratedItems();
  return useMemo(
    () => calendarLooksOf({ calendars, responseOf, generated }),
    [calendars, responseOf, generated],
  );
}
