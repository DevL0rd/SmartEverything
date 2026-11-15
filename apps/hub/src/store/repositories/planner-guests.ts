import {
  PLANNER_GUEST_ROW,
  type PlannerGuestDelivery,
  type PlannerGuestResponse,
  type PlannerGuestRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { inList } from '../sql';

const STORED_GUEST = storedRow(PLANNER_GUEST_ROW, {});

const COLUMNS = `id, item_id, kind, profile_id, email, name, response, note, delivery,
  delivery_detail, invited_at, responded_at`;

const CONTACT = z.strictObject({
  email: z.email(),
  name: z.string().nullable(),
  last_invited_at: z.string(),
});

export interface PlannerGuestContact {
  readonly email: string;
  readonly name: string | null;
  readonly lastInvitedAt: string;
}

export interface PlannerGuestInput {
  readonly item_id: string;
  readonly kind: PlannerGuestRow['kind'];
  readonly profile_id: string | null;
  readonly email: string | null;
  readonly name: string | null;
  readonly delivery: PlannerGuestDelivery;
  readonly delivery_detail: string | null;
  readonly token_hash: string | null;
}

export interface PlannerGuestPatch {
  readonly name?: string | null | undefined;
  readonly response?: PlannerGuestResponse | undefined;
  readonly note?: string | null | undefined;
  readonly responded_at?: string | null | undefined;
  readonly delivery?: PlannerGuestDelivery | undefined;
  readonly delivery_detail?: string | null | undefined;
}

export function removeGuestsOfItems(context: StoreContext, itemIds: readonly string[]): void {
  context.write(() => {
    const items = inList('item_id', 'ids', itemIds);
    const removed = context.sql.all(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where ${items.text}`,
      items.parameters,
    );
    context.sql.run(
      'remove the planner guests of the items',
      `delete from planner_guests where ${items.text}`,
      items.parameters,
    );
    for (const before of removed) context.changed('planner_guests', 'DELETE', null, before);
  });
}

export class PlannerGuestsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PlannerGuestRow | undefined {
    return this.context.sql.get(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where id = $id`,
      { id },
    );
  }

  byId(id: string): PlannerGuestRow {
    return found(this.find(id), 'planner guest', id);
  }

  byToken(tokenHash: string): PlannerGuestRow | undefined {
    return this.context.sql.get(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where token_hash = $tokenHash`,
      { tokenHash },
    );
  }

  ofPerson(itemId: string, profileId: string): PlannerGuestRow | undefined {
    return this.context.sql.get(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where item_id = $itemId and profile_id = $profileId`,
      { itemId, profileId },
    );
  }

  forItem(itemId: string): PlannerGuestRow[] {
    return this.context.sql.all(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where item_id = $itemId order by invited_at, id`,
      { itemId },
    );
  }

  forItems(itemIds: readonly string[]): PlannerGuestRow[] {
    const items = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where ${items.text} order by item_id, invited_at, id`,
      items.parameters,
    );
  }

  forProfile(profileId: string): PlannerGuestRow[] {
    return this.context.sql.all(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests where profile_id = $profileId order by invited_at, id`,
      { profileId },
    );
  }

  all(): PlannerGuestRow[] {
    return this.context.sql.all(
      STORED_GUEST,
      `select ${COLUMNS} from planner_guests order by item_id, invited_at, id`,
    );
  }

  emailContacts(profileId: string): PlannerGuestContact[] {
    return this.context.sql
      .all(
        CONTACT,
        `select g.email as email, g.name as name, max(g.invited_at) as last_invited_at
         from planner_guests g join planner_items i on i.id = g.item_id
         where i.profile_id = $profileId and g.email is not null
         group by lower(g.email) order by last_invited_at desc, lower(g.email)`,
        { profileId },
      )
      .map((row) => ({ email: row.email, name: row.name, lastInvitedAt: row.last_invited_at }));
  }

  insert(input: PlannerGuestInput): PlannerGuestRow {
    return this.context.write(() => {
      const { token_hash: tokenHash, ...fields } = input;
      const row = PLANNER_GUEST_ROW.parse({
        ...fields,
        id: this.context.newId(),
        response: 'needs_action',
        note: null,
        invited_at: this.context.now(),
        responded_at: null,
      });
      const values = { ...row, token_hash: tokenHash };
      const columns = Object.keys(values);
      this.context.sql.run(
        'invite the planner guest',
        `insert into planner_guests (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_guests', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, patch: PlannerGuestPatch): PlannerGuestRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const after = PLANNER_GUEST_ROW.parse({ ...before, ...definedOnly(patch) });
      const set = assignments({
        name: after.name,
        response: after.response,
        note: after.note,
        responded_at: after.responded_at,
        delivery: after.delivery,
        delivery_detail: after.delivery_detail,
      });
      this.context.sql.run(
        'change the planner guest',
        `update planner_guests set ${set.text} where id = $id`,
        { ...set.parameters, id },
      );
      this.context.changed('planner_guests', 'UPDATE', after, before);
      return after;
    });
  }

  replaceToken(id: string, tokenHash: string): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'give the planner guest a new link',
        'update planner_guests set token_hash = $tokenHash where id = $id',
        { id, tokenHash },
      );
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'remove the planner guest',
        'delete from planner_guests where id = $id',
        {
          id,
        },
      );
      this.context.changed('planner_guests', 'DELETE', null, before);
    });
  }
}

function definedOnly(patch: PlannerGuestPatch): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
