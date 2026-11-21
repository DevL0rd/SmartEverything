import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { completeOpenSteps } from '../../src/planner/units/completion';
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
let items: ReturnType<typeof plannerItemRoutes>;
let collections: ReturnType<typeof plannerCollectionRoutes>;

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

const list = async (): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, ann, {
      body: { kind: 'list', name: 'Tasks', colour: 'home', icon: 'house' },
    }),
  );

const task = async (
  collectionId: string,
  title: string,
  extra: object = {},
): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.createPlannerItem, ann, {
      body: { collection_id: collectionId, kind: 'task', title, ...extra },
    }),
  );

const patch = async (itemId: string, changes: object): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.updatePlannerItem, ann, { params: { itemId }, body: { changes } }),
  );

const stored = (id: string): PlannerItemRow => test.store.plannerItems.anyById(id);

beforeEach(async () => {
  test = await testStore(() => NOW);
  addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  const context = { store: test.store };
  items = plannerItemRoutes(context);
  collections = plannerCollectionRoutes(context);
});

afterEach(async () => {
  await test.close();
});

describe('indent, outdent and reorder', () => {
  it('indents a task under another and appends it after the steps there', async () => {
    const tasks = await list();
    const trip = await task(tasks.id, 'Trip');
    const first = await task(tasks.id, 'Tickets', { parent_id: trip.id });
    const loose = await task(tasks.id, 'Passport');
    const indented = await patch(loose.id, { parent_id: trip.id });
    expect(indented.parent_id).toBe(trip.id);
    expect(indented.position).toBeGreaterThan(first.position);
  });

  it('outdents a step to sit right after its former parent', async () => {
    const tasks = await list();
    const trip = await task(tasks.id, 'Trip');
    const next = await task(tasks.id, 'Taxes');
    const step = await task(tasks.id, 'Tickets', { parent_id: trip.id });
    const outdented = await patch(step.id, { parent_id: null });
    expect(outdented.parent_id).toBeNull();
    expect(outdented.position).toBeGreaterThan(trip.position);
    expect(outdented.position).toBeLessThan(next.position);
  });

  it('reorders steps by position', async () => {
    const tasks = await list();
    const trip = await task(tasks.id, 'Trip');
    const one = await task(tasks.id, 'One', { parent_id: trip.id });
    const two = await task(tasks.id, 'Two', { parent_id: trip.id });
    await patch(two.id, { position: one.position - 1 });
    expect(
      test.store.plannerItems.children(trip.id, ann.profileId).map((step) => step.title),
    ).toEqual(['Two', 'One']);
  });

  it('keeps one level: no steps of steps, no parent with steps becoming a step, no cycles', async () => {
    const tasks = await list();
    const trip = await task(tasks.id, 'Trip');
    const step = await task(tasks.id, 'Tickets', { parent_id: trip.id });
    const other = await task(tasks.id, 'Other');
    await expect(task(tasks.id, 'Deep', { parent_id: step.id })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(patch(trip.id, { parent_id: other.id })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(patch(other.id, { parent_id: other.id })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('keeps a step in the list of its task and refuses steps on an event', async () => {
    const tasks = await list();
    const elsewhere = await list();
    const trip = await task(tasks.id, 'Trip');
    await expect(task(elsewhere.id, 'Tickets', { parent_id: trip.id })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    const meeting = PLANNER_ITEM_ROW.parse(
      await call(items.createPlannerItem, ann, {
        body: {
          collection_id: tasks.id,
          kind: 'event',
          title: 'Meet',
          start_local: '2026-11-09T10:00',
          time_zone: 'UTC',
        },
      }),
    );
    await expect(task(tasks.id, 'Agenda', { parent_id: meeting.id })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});

describe('completing a parent', () => {
  it('completes its open steps in the same write and leaves finished ones alone', async () => {
    const tasks = await list();
    const trip = await task(tasks.id, 'Trip');
    const one = await task(tasks.id, 'One', { parent_id: trip.id });
    const two = await task(tasks.id, 'Two', { parent_id: trip.id });
    await call(items.completePlannerItem, ann, { params: { itemId: two.id }, body: {} });
    const finished = test.store.plannerOccurrences.find(two.id, 'single');
    await call(items.completePlannerItem, ann, { params: { itemId: trip.id }, body: {} });
    expect(stored(trip.id).status).toBe('done');
    expect(stored(one.id).status).toBe('done');
    expect(test.store.plannerOccurrences.find(one.id, 'single')).toMatchObject({
      status: 'done',
      completed_by: 'person',
    });
    expect(test.store.plannerOccurrences.find(two.id, 'single')).toEqual(finished);
  });

  it('does not complete the steps of a repeating task', async () => {
    const tasks = await list();
    const daily = await task(tasks.id, 'Daily', {
      start_local: '2026-11-09T09:00',
      time_zone: 'UTC',
      rrule: 'FREQ=DAILY',
    });
    const step = await task(tasks.id, 'Part', { parent_id: daily.id });
    expect(
      completeOpenSteps(test.store, daily, { at: NOW.toISOString(), by: 'person', evidence: null }),
    ).toEqual([]);
    expect(stored(step.id).status).toBe('open');
  });
});
