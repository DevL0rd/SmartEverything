import { notify } from '../../../components/toast-store';
import { usePlannerWrites } from '../data';
import { usePlannerSharing, useViewerCalendars, type ViewerLook } from '../data/sharing';
import type { CollectionChange } from '../data/writes';
import { usePlannerFrame } from '../frame/frame-context';
import type { ViewerCalendar } from './calendars-model';

export type LookEdit = (calendarId: string, change: ViewerLook) => void;

export function mayChangeLook(calendar: ViewerCalendar): boolean {
  return calendar.role === 'owner' || calendar.share !== null;
}

export function useCalendarLookEdit(): LookEdit {
  const { person } = usePlannerFrame();
  const calendars = useViewerCalendars(person);
  const sharing = usePlannerSharing(person);
  return (calendarId, change) => {
    const calendar = calendars.find((entry) => entry.row.id === calendarId);
    if (calendar === undefined || !mayChangeLook(calendar)) return;
    sharing.look(calendar, change).catch((error: unknown) => {
      notify({ message: `${calendar.row.name} was not changed`, error, tone: 'critical' });
    });
  };
}

export type CalendarEdit = (calendar: ViewerCalendar, change: CollectionChange) => void;

export function useCalendarEdit(): CalendarEdit {
  const writes = usePlannerWrites(usePlannerFrame().person);
  return (calendar, change) => {
    writes.updateCollection(calendar.row, change).catch((error: unknown) => {
      notify({ message: `${calendar.row.name} was not changed`, error, tone: 'critical' });
    });
  };
}
