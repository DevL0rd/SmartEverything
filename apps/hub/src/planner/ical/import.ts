import { PLANNER_IMPORT_RESULT, type PlannerImportResult } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { unsupportedSummary } from './model';
import type { CalendarReader } from './calendar-reader';

export interface IcsImport {
  readonly profileId: string;
  readonly collectionId: string;
  readonly text: string;
  readonly defaultZone: string;
}

export async function importIcs(
  store: Pick<Store, 'host'>,
  calendars: CalendarReader,
  now: () => Date,
  request: IcsImport,
): Promise<PlannerImportResult> {
  const calendar = await calendars.read(request.text, { defaultZone: request.defaultZone });
  const tally = await store.host.write('plannerEntriesApply', {
    request: {
      profileId: request.profileId,
      collectionId: request.collectionId,
      createdBy: 'person',
      removeMissing: false,
    },
    entries: calendar.entries,
    nowMs: now().getTime(),
  });
  return PLANNER_IMPORT_RESULT.parse({
    added: tally.added,
    updated: tally.updated,
    unchanged: tally.unchanged,
    unsupported: unsupportedSummary(calendar.unsupported),
  });
}
