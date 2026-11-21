import {
  PLANNER_COLLECTION_ROW,
  PLANNER_GUEST_ROW,
  PLANNER_ITEM_ROW,
  type CommittedNotice,
  type PlannerGuestRow,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type SignalInput,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeRange } from '../../src/planner/range';
import { visible, type Hearing } from '../../src/server/live-visibility';
import { CollaborationDesk } from '../../src/planner/sharing/desk';
import { itemRoleOf } from '../../src/planner/sharing/visibility';
import type { Caller } from '../../src/server/auth';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import { plannerSharingRoutes } from '../../src/server/handlers/planner-sharing';
import { plannerTablesOf } from '../../src/server/snapshot-tables';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-09T08:00:00.000Z');
const GUESTS = z.array(PLANNER_GUEST_ROW);

let test: TestStore;
let ann: TestPerson;
let bob: TestPerson;
let cat: TestPerson;
let items: ReturnType<typeof plannerItemRoutes>;
let collections: ReturnType<typeof plannerCollectionRoutes>;
let sharing: ReturnType<typeof plannerSharingRoutes>;
let notices: CommittedNotice[];
let signals: SignalInput[];
let desk: CollaborationDesk;
let stopNotices: () => void;

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const calendar = async (person: TestPerson): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, person, {
      body: { kind: 'calendar', name: 'Ann', colour: 'work', icon: 'briefcase' },
    }),
  );

const event = async (person: TestPerson, collectionId: string): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.createPlannerItem, person, {
      body: {
        collection_id: collectionId,
        kind: 'event',
        title: 'Dinner',
        start_local: '2026-11-09T19:00',
        end_local: '2026-11-09T20:00',
        time_zone: 'UTC',
      },
    }),
  );

const setGuests = async (
  person: TestPerson,
  itemId: string,
  guests: object[],
): Promise<PlannerGuestRow[]> =>
  GUESTS.parse(
    await call(sharing.setPlannerGuests, person, { params: { itemId }, body: { guests } }),
  );

const dayTitles = (person: TestPerson): string[] =>
  composeRange(test.store, {
    profileId: person.profileId,
    window: {
      from: Temporal.Instant.from('2026-11-09T00:00:00Z'),
      to: Temporal.Instant.from('2026-11-10T00:00:00Z'),
      timeZone: 'UTC',
    },
    now: Temporal.Instant.from(NOW.toISOString()),
  }).occurrences.map((view) => view.title);

beforeEach(async () => {
  test = await testStore(() => NOW);
  addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  cat = addPerson(test, 'Cat', 'member');
  const context = { store: test.store };
  items = plannerItemRoutes(context);
  collections = plannerCollectionRoutes(context);
  sharing = plannerSharingRoutes(context, () => NOW);
  notices = [];
  signals = [];
  stopNotices = test.store.feed.subscribeNotices((notice) => notices.push(notice));
  desk = new CollaborationDesk({
    store: test.store,
    clock: {
      now: (): Date => NOW,
    },
    emit: (signal): void => {
      signals.push(signal);
    },
  });
  desk.start();
});

afterEach(async () => {
  desk.stop();
  stopNotices();
  await test.close();
});

describe('the guest list', () => {
  it('invites members and email contacts and keeps answers when the list changes', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    const first = await setGuests(ann, dinner.id, [
      { kind: 'person', profile_id: bob.profileId },
      { kind: 'email', email: 'Sam@Example.com', name: 'Sam' },
    ]);
    expect(first.map((guest) => guest.kind).sort()).toEqual(['email', 'person']);
    expect(first.every((guest) => guest.response === 'needs_action')).toBe(true);
    await call(sharing.respondPlannerInvite, bob, {
      params: { itemId: dinner.id },
      body: { response: 'yes', note: 'Bringing wine' },
    });
    const second = await setGuests(ann, dinner.id, [
      { kind: 'person', profile_id: bob.profileId },
      { kind: 'person', profile_id: cat.profileId },
      { kind: 'email', email: 'sam@example.com', name: 'Sam' },
    ]);
    expect(second).toHaveLength(3);
    expect(second.find((guest) => guest.profile_id === bob.profileId)).toMatchObject({
      response: 'yes',
      note: 'Bringing wine',
    });
    const removed = await setGuests(ann, dinner.id, [
      { kind: 'person', profile_id: cat.profileId },
    ]);
    expect(removed.map((guest) => guest.profile_id)).toEqual([cat.profileId]);
  });

  it('refuses guests on a task, on an occurrence and from a viewer', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    const task = PLANNER_ITEM_ROW.parse(
      await call(items.createPlannerItem, ann, {
        body: { collection_id: work.id, kind: 'task', title: 'Buy' },
      }),
    );
    await expect(setGuests(ann, task.id, [])).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      setGuests(bob, dinner.id, [{ kind: 'person', profile_id: cat.profileId }]),
    ).rejects.toThrow(/no planner item|exist/i);
  });

  it('shows an invited event to its member guest and hides it once declined', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    expect(dayTitles(bob)).toEqual([]);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: bob.profileId }]);
    expect(dayTitles(bob)).toEqual(['Dinner']);
    const tables = plannerTablesOf(test.store, { client: bob.client, profileId: bob.profileId });
    expect(tables.planner_items.map((row) => row.id)).toEqual([dinner.id]);
    expect(tables.planner_guests).toHaveLength(1);
    expect(tables.planner_collections).toHaveLength(1);
    await call(sharing.respondPlannerInvite, bob, {
      params: { itemId: dinner.id },
      body: { response: 'no' },
    });
    expect(dayTitles(bob)).toEqual([]);
    const after = plannerTablesOf(test.store, { client: bob.client, profileId: bob.profileId });
    expect(after.planner_items.map((row) => row.id)).toEqual([dinner.id]);
    expect(dayTitles(ann)).toEqual(['Dinner']);
  });

  it('lets a guest answer and nothing else', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: bob.profileId }]);
    expect(itemRoleOf(test.store, bob.profileId, dinner)).toBe('guest');
    await expect(
      call(items.updatePlannerItem, bob, {
        params: { itemId: dinner.id },
        body: { changes: { title: 'Mine' } },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      call(sharing.respondPlannerInvite, cat, {
        params: { itemId: dinner.id },
        body: { response: 'yes' },
      }),
    ).rejects.toThrow();
  });
});

describe('guests and range filters', () => {
  it('keeps an invited event when a calendar filter leaves its calendar out', async () => {
    const work = await calendar(ann);
    const mine = await calendar(bob);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: bob.profileId }]);
    const titles = (collectionIds: readonly string[]): string[] =>
      composeRange(test.store, {
        profileId: bob.profileId,
        window: {
          from: Temporal.Instant.from('2026-11-09T00:00:00Z'),
          to: Temporal.Instant.from('2026-11-10T00:00:00Z'),
          timeZone: 'UTC',
        },
        now: Temporal.Instant.from(NOW.toISOString()),
        collectionIds,
      }).occurrences.map((view) => view.title);
    expect(titles([mine.id])).toEqual(['Dinner']);
    expect(titles([])).toEqual(['Dinner']);
  });

  it('delivers the deletion of an event to the guests that just lost their rows', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: bob.profileId }]);
    const seen: Record<string, boolean> = {};
    const unsubscribe = test.store.feed.subscribe((change) => {
      if (change.table !== 'planner_items' || change.operation !== 'DELETE') return;
      const hearing = (person: TestPerson): Hearing => ({
        client: person.client,
        tables: new Set(['planner_items']),
      });
      seen['ann'] = visible(hearing(ann), change, test.store);
      seen['bob'] = visible(hearing(bob), change, test.store);
      seen['cat'] = visible(hearing(cat), change, test.store);
    });
    await call(items.deletePlannerItem, ann, { params: { itemId: dinner.id } });
    unsubscribe();
    expect(seen).toEqual({ ann: true, bob: true, cat: false });
  });
});

describe('notices and signals', () => {
  it('tells a member they are invited and the organiser how they answered', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: bob.profileId }]);
    await desk.settled();
    expect(notices).toContainEqual({
      type: 'planner_invited',
      personId: bob.profileId,
      itemId: dinner.id,
      title: 'Dinner',
      startsAt: '2026-11-09T19:00:00.000Z',
      inviterId: ann.profileId,
    });
    await call(sharing.respondPlannerInvite, bob, {
      params: { itemId: dinner.id },
      body: { response: 'maybe' },
    });
    await desk.settled();
    expect(notices).toContainEqual(
      expect.objectContaining({
        type: 'planner_rsvp',
        personId: ann.profileId,
        itemId: dinner.id,
        response: 'maybe',
      }),
    );
    await desk.settled();
    expect(signals).toHaveLength(1);
    await desk.settled();
    expect(signals[0]).toMatchObject({
      kind: 'guest_responded',
      subject: dinner.id,
      profileId: ann.profileId,
      data: { response: 'maybe', title: 'Dinner' },
    });
  });

  it('does not invite the organiser to their own event by notice', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [{ kind: 'person', profile_id: ann.profileId }]);
    await desk.settled();
    expect(notices.filter((notice) => notice.type === 'planner_invited')).toEqual([]);
  });
});

describe('guest suggestions', () => {
  it('suggests email contacts invited before, folded for accents and case', async () => {
    const work = await calendar(ann);
    const dinner = await event(ann, work.id);
    await setGuests(ann, dinner.id, [
      { kind: 'email', email: 'rene@example.com', name: 'René Dupont' },
      { kind: 'email', email: 'sam@example.com', name: null },
    ]);
    const hit = await call(sharing.suggestPlannerGuests, ann, { query: { text: 'rene DUP' } });
    expect(hit).toEqual([{ email: 'rene@example.com', name: 'René Dupont' }]);
    const byAddress = await call(sharing.suggestPlannerGuests, ann, { query: { text: 'sam@' } });
    expect(byAddress).toEqual([{ email: 'sam@example.com', name: null }]);
    expect(await call(sharing.suggestPlannerGuests, bob, { query: { text: 'sam' } })).toEqual([]);
  });
});
