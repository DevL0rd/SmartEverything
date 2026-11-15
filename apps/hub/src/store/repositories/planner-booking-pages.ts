import { PLANNER_BOOKING_PAGE_ROW, type PlannerBookingPageRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';
import { newPublicToken } from './public-token';

const STORED_PAGE = storedRow(PLANNER_BOOKING_PAGE_ROW, {
  flags: ['enabled'],
  json: ['availability'],
});

const COLUMNS = `id, profile_id, collection_id, title, description, minutes, availability,
  buffer_before, buffer_after, notice_minutes, ahead_days, location, enabled, token, created_at,
  updated_at`;

export type PlannerBookingPageInput = Omit<
  PlannerBookingPageRow,
  'id' | 'profile_id' | 'token' | 'created_at' | 'updated_at'
>;

type PlannerBookingPagePatchFields = Omit<
  PlannerBookingPageRow,
  'id' | 'profile_id' | 'token' | 'created_at' | 'updated_at'
>;

export type PlannerBookingPagePatch = {
  readonly [K in keyof PlannerBookingPagePatchFields]?:
    PlannerBookingPagePatchFields[K] | undefined;
};

function parameters(row: PlannerBookingPageRow): Record<string, SQLInputValue> {
  return { ...row, availability: jsonText(row.availability), enabled: flag(row.enabled) };
}

export function removeBookingPagesOfCollection(context: StoreContext, collectionId: string): void {
  context.write(() => {
    const removed = context.sql.all(
      STORED_PAGE,
      `select ${COLUMNS} from planner_booking_pages where collection_id = $collectionId`,
      { collectionId },
    );
    context.sql.run(
      'remove the booking pages of the collection',
      'delete from planner_booking_pages where collection_id = $collectionId',
      { collectionId },
    );
    for (const before of removed) context.changed('planner_booking_pages', 'DELETE', null, before);
  });
}

export class PlannerBookingPagesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string, profileId: string): PlannerBookingPageRow | undefined {
    return this.context.sql.get(
      STORED_PAGE,
      `select ${COLUMNS} from planner_booking_pages where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): PlannerBookingPageRow {
    return found(this.find(id, profileId), 'planner booking page', id);
  }

  byToken(token: string): PlannerBookingPageRow | undefined {
    return this.context.sql.get(
      STORED_PAGE,
      `select ${COLUMNS} from planner_booking_pages where token = $token`,
      { token },
    );
  }

  list(profileId: string): PlannerBookingPageRow[] {
    return this.context.sql.all(
      STORED_PAGE,
      `select ${COLUMNS} from planner_booking_pages where profile_id = $profileId
       order by created_at, id`,
      { profileId },
    );
  }

  all(): PlannerBookingPageRow[] {
    return this.context.sql.all(
      STORED_PAGE,
      `select ${COLUMNS} from planner_booking_pages order by profile_id, created_at, id`,
    );
  }

  insert(profileId: string, input: PlannerBookingPageInput): PlannerBookingPageRow {
    return this.context.write(() => {
      const now = this.context.now();
      const row = PLANNER_BOOKING_PAGE_ROW.parse({
        ...input,
        id: this.context.newId(),
        profile_id: profileId,
        token: newPublicToken(),
        created_at: now,
        updated_at: now,
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner booking page',
        `insert into planner_booking_pages (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_booking_pages', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, patch: PlannerBookingPagePatch): PlannerBookingPageRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      return this.save(before, { ...before, ...patch, updated_at: this.context.now() });
    });
  }

  resetToken(id: string, profileId: string): PlannerBookingPageRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      return this.save(before, {
        ...before,
        token: newPublicToken(),
        updated_at: this.context.now(),
      });
    });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run(
        'remove the planner booking page',
        'delete from planner_booking_pages where id = $id',
        { id },
      );
      this.context.changed('planner_booking_pages', 'DELETE', null, before);
    });
  }

  private save(before: PlannerBookingPageRow, next: unknown): PlannerBookingPageRow {
    const after = PLANNER_BOOKING_PAGE_ROW.parse(next);
    const set = assignments(parameters(after));
    this.context.sql.run(
      'change the planner booking page',
      `update planner_booking_pages set ${set.text} where id = $id`,
      set.parameters,
    );
    this.context.changed('planner_booking_pages', 'UPDATE', after, before);
    return after;
  }
}
