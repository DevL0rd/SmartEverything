import {
  CalendarListSchema,
  calendarListQuery,
  type CalendarListEntry,
} from '@smarteverything/google';
import type { Store } from '../../store/store';
import { Ctx, type Requester, type Run } from './calendar-run';

export interface CalendarListDeps {
  readonly store: Pick<Store, 'host'>;
  readonly request: Requester;
}

export class CalendarMirror {
  constructor(private readonly deps: CalendarListDeps) {}

  async contexts(run: Run): Promise<Ctx[]> {
    const entries = await this.entries(run.profileId);
    const mirrored = await this.deps.store.host.write('plannerGoogleCalendarMirror', {
      profileId: run.profileId,
      entries,
    });
    return mirrored.map(({ scope, position }) => new Ctx({ ...scope, run, position }));
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
}
