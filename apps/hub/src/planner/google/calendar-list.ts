import type { PlannerCollectionRow } from '@smarteverything/domain';
import {
  CalendarListSchema,
  calendarListQuery,
  type CalendarListEntry,
} from '@smarteverything/google';
import type { Store } from '../../store/store';
import { calendarName, colourKeyOf, isReadOnlyCalendar } from './calendar-map';
import { Ctx, type Requester, type Run } from './calendar-run';

export interface CalendarListDeps {
  readonly store: Pick<Store, 'plannerItems' | 'plannerCollections' | 'googleAccounts'>;
  readonly request: Requester;
}

export class CalendarMirror {
  constructor(private readonly deps: CalendarListDeps) {}

  async contexts(run: Run): Promise<Ctx[]> {
    const { store } = this.deps;
    const entries = await this.entries(run.profileId);
    const contexts: Ctx[] = [];
    for (const id of store.googleAccounts.byProfile(run.profileId).calendar_ids) {
      const entry = entries.get(id);
      const known = store.plannerCollections.byGoogle(run.profileId, id);
      if (entry === undefined || entry.deleted === true) {
        if (known !== undefined) store.plannerCollections.remove(known.id, run.profileId);
        continue;
      }
      const collection = this.mirror(run, entry, known);
      const position = store.plannerItems
        .list(run.profileId, { collectionIds: [collection.id] })
        .reduce((top, item) => Math.max(top, item.position + 1), 0);
      contexts.push(
        new Ctx({
          run,
          collection,
          calendarId: id,
          zone: entry.timeZone,
          readOnly: isReadOnlyCalendar(entry),
          position,
        }),
      );
    }
    return contexts;
  }

  private async entries(profileId: string): Promise<Map<string, CalendarListEntry>> {
    const entries = new Map<string, CalendarListEntry>();
    let pageToken: string | undefined;
    do {
      const page = await this.deps.request({
        profileId,
        method: 'GET',
        url: calendarListQuery(pageToken === undefined ? {} : { pageToken }),
        schema: CalendarListSchema,
      });
      for (const entry of page.items) entries.set(entry.id, entry);
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return entries;
  }

  private mirror(
    run: Run,
    entry: CalendarListEntry,
    known: PlannerCollectionRow | undefined,
  ): PlannerCollectionRow {
    const { plannerCollections } = this.deps.store;
    const google = { id: entry.id, etag: entry.etag ?? null, syncToken: null };
    if (known === undefined) {
      const position = plannerCollections
        .list(run.profileId)
        .reduce((top, row) => Math.max(top, row.position + 1), 0);
      return plannerCollections.insert({
        profile_id: run.profileId,
        kind: 'calendar',
        name: calendarName(entry),
        colour: colourKeyOf(entry.backgroundColor),
        icon: 'calendar',
        position,
        visible: entry.selected !== false,
        default_reminders: [],
        source: 'google',
        google,
      });
    }
    if (known.google?.etag === google.etag) return known;
    return plannerCollections.update(known.id, run.profileId, {
      name: calendarName(entry),
      google: { ...google, syncToken: known.google?.syncToken ?? null },
    });
  }
}
