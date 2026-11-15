import type { PlannerImportResult } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { usePlannerWrites } from '../data';
import { usePlannerFeeds } from '../data/feeds';
import { usePlannerSharing } from '../data/sharing';
import { usePlannerFrame } from '../frame/frame-context';
import type { ViewerCalendar } from './calendars-model';
import { exportNameOf } from './feeds-model';
import { pickIcsFile, saveIcsFile } from './ics-file';

export interface CalendarActions {
  readonly importInto: (calendar: ViewerCalendar) => Promise<PlannerImportResult | null>;
  readonly exportFile: (calendar: ViewerCalendar) => void;
  readonly refresh: (calendar: ViewerCalendar) => void;
  readonly remove: (calendar: ViewerCalendar) => void;
  readonly leave: (calendar: ViewerCalendar) => void;
}

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

function removeText(calendar: ViewerCalendar): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  if (calendar.row.feed?.kind === 'ics') {
    return {
      title: `Unsubscribe from ${calendar.row.name}?`,
      body: 'Its events leave your Planner. You can subscribe to the address again later.',
      confirmLabel: 'Unsubscribe',
    };
  }
  return {
    title: `Delete ${calendar.row.name}?`,
    body: 'Every event in this calendar is deleted, for everyone it is shared with.',
    confirmLabel: 'Delete',
  };
}

export function useCalendarActions(): CalendarActions {
  const { person } = usePlannerFrame();
  const feeds = usePlannerFeeds(person);
  const writes = usePlannerWrites(person);
  const sharing = usePlannerSharing(person);
  return {
    importInto: async (calendar): Promise<PlannerImportResult | null> => {
      const file = await pickIcsFile();
      if (file === null) return null;
      return feeds.importFile(calendar.row.id, file);
    },
    exportFile: (calendar): void => {
      feeds
        .exportCalendar(calendar.row.id)
        .then((bytes) => saveIcsFile(exportNameOf(calendar.row.name), bytes))
        .catch(failed(`${calendar.row.name} was not exported`));
    },
    refresh: (calendar): void => {
      feeds
        .refresh(calendar.row.id)
        .then(() => {
          notify({ message: `${calendar.row.name} refreshed` });
        })
        .catch(failed(`${calendar.row.name} could not be refreshed`));
    },
    remove: (calendar): void => {
      const text = removeText(calendar);
      confirm({ ...text, tone: 'destructive' })
        .then((yes) => (yes ? writes.deleteCollection(calendar.row) : undefined))
        .catch(failed(`${calendar.row.name} was not deleted`));
    },
    leave: (calendar): void => {
      const share = calendar.share;
      if (share === null) return;
      confirm({
        title: `Leave ${calendar.row.name}?`,
        body: 'Its events leave your Planner. The owner can share it with you again.',
        confirmLabel: 'Leave',
        tone: 'destructive',
      })
        .then((yes) => (yes ? sharing.unshare(calendar, share.profile_id) : undefined))
        .catch(failed(`You are still in ${calendar.row.name}`));
    },
  };
}
