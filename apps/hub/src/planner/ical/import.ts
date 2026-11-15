import { PLANNER_IMPORT_RESULT, type PlannerImportResult } from '@smarteverything/domain';
import { applyEntries, type ApplyStore } from './apply';
import { unsupportedSummary } from './model';
import { readCalendar } from './read';

export interface IcsImport {
  readonly profileId: string;
  readonly collectionId: string;
  readonly text: string;
  readonly defaultZone: string;
}

export function importIcs(
  store: ApplyStore,
  now: () => Date,
  request: IcsImport,
): PlannerImportResult {
  const calendar = readCalendar(request.text, { defaultZone: request.defaultZone });
  const tally = applyEntries(
    store,
    now,
    {
      profileId: request.profileId,
      collectionId: request.collectionId,
      createdBy: 'person',
      removeMissing: false,
    },
    calendar.entries,
  );
  return PLANNER_IMPORT_RESULT.parse({
    added: tally.added,
    updated: tally.updated,
    unchanged: tally.unchanged,
    unsupported: unsupportedSummary(calendar.unsupported),
  });
}
