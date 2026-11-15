import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type CommittedNotice,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeRange } from '../../src/planner/range';
import { CollaborationDesk } from '../../src/planner/sharing/desk';
import type { Caller } from '../../src/server/auth';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-09T08:00:00.000Z');

let test: TestStore;
let ann: TestPerson;
let bob: TestPerson;
let cat: TestPerson;
let items: ReturnType<typeof plannerItemRoutes>;
let collections: ReturnType<typeof plannerCollectionRoutes>;
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

const list = async (person: TestPerson): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, person, {
      body: { kind: 'list', name: 'Chores', colour: 'home', icon: 'house' },
    }),
  );

const task = async (
  person: TestPerson,
  collectionId: string,
  extra: object = {},
): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.createPlannerItem, person, {
      body: {
        collection_id: collectionId,
        kind: 'task',
        title: 'Take out the bins',
        due_date: '2026-11-09',
        ...extra,
      },
    }),
  );

const patch = (person: TestPerson, itemId: string, changes: object): Promise<unknown> =>
  call(items.updatePlannerItem, person, { params: { itemId }, body: { changes } });

const titles = (person: TestPerson): string[] =>
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
  items = plannerItemRoutes(context, () => NOW);
  collections = plannerCollectionRoutes(context);
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

describe('assigning a task', () => {
  it('gives the assignee the task without sharing the list', async () => {
    const chores = await list(ann);
    const bins = await task(ann, chores.id, { assignee_id: bob.profileId });
    expect(bins.assignee_id).toBe(bob.profileId);
    expect(titles(bob)).toEqual(['Take out the bins']);
    expect(titles(cat)).toEqual([]);
    const done = await call(items.completePlannerItem, bob, {
      params: { itemId: bins.id },
      body: {},
    });
    expect(done).toMatchObject({ status: 'done' });
    expect(test.store.plannerItems.anyById(bins.id).status).toBe('done');
  });

  it('lets the assignee change the notes and the steps but nothing else', async () => {
    const chores = await list(ann);
    const bins = await task(ann, chores.id, { assignee_id: bob.profileId });
    await patch(bob, bins.id, { notes: 'Both bins' });
    await expect(patch(bob, bins.id, { title: 'Other' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(patch(bob, bins.id, { assignee_id: null })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const step = await task(bob, chores.id, { title: 'Blue bin', parent_id: bins.id });
    expect(step.profile_id).toBe(ann.profileId);
    await patch(bob, step.id, { title: 'Blue bin first' });
    expect(test.store.plannerItems.anyById(step.id).title).toBe('Blue bin first');
    await call(items.deletePlannerItem, bob, { params: { itemId: step.id } });
    await expect(
      call(items.deletePlannerItem, bob, { params: { itemId: bins.id } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses to assign an event, a stranger to the Planner or a task of a list the caller cannot edit', async () => {
    const chores = await list(ann);
    const meeting = PLANNER_ITEM_ROW.parse(
      await call(items.createPlannerItem, ann, {
        body: {
          collection_id: chores.id,
          kind: 'event',
          title: 'Meet',
          start_local: '2026-11-09T10:00',
          time_zone: 'UTC',
        },
      }),
    );
    await expect(patch(ann, meeting.id, { assignee_id: bob.profileId })).rejects.toThrow();
    const bins = await task(ann, chores.id);
    await expect(patch(bob, bins.id, { assignee_id: bob.profileId })).rejects.toThrow();
  });

  it('refuses a person without the Planner area', async () => {
    const chores = await list(ann);
    const bins = await task(ann, chores.id);
    const scopes = test.store.personAccess.byProfile(cat.profileId).scopes;
    test.store.personAccess.change(cat.profileId, { scopes: { ...scopes, areas: ['home'] } });
    await expect(patch(ann, bins.id, { assignee_id: cat.profileId })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('notices and signals the assignment and tells the assigner when it is done', async () => {
    const chores = await list(ann);
    const bins = await task(ann, chores.id, { assignee_id: bob.profileId });
    expect(notices).toContainEqual({
      type: 'planner_assigned',
      personId: bob.profileId,
      itemId: bins.id,
      title: 'Take out the bins',
      state: 'assigned',
      assignerId: ann.profileId,
      assigneeId: bob.profileId,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'task_assigned',
      subject: bins.id,
      profileId: bob.profileId,
      data: { assigneeId: bob.profileId, assignerId: ann.profileId },
    });
    await call(items.completePlannerItem, bob, { params: { itemId: bins.id }, body: {} });
    expect(notices).toContainEqual(
      expect.objectContaining({
        type: 'planner_assigned',
        state: 'done',
        personId: ann.profileId,
        assigneeId: bob.profileId,
      }),
    );
  });

  it('does not notice a task the owner assigns to themselves', async () => {
    const chores = await list(ann);
    await task(ann, chores.id, { assignee_id: ann.profileId });
    expect(notices.filter((notice) => notice.type === 'planner_assigned')).toEqual([]);
  });

  it('keeps a task assigned to someone else out of the day of a list viewer', async () => {
    const chores = await list(ann);
    await task(ann, chores.id, { assignee_id: bob.profileId });
    test.store.plannerShares.save({
      collection_id: chores.id,
      profile_id: cat.profileId,
      role: 'view',
    });
    expect(titles(cat)).toEqual([]);
    expect(titles(ann)).toEqual(['Take out the bins']);
  });
});
