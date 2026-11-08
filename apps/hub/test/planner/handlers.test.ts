import {
  PLANNER_COLLECTION_ROW,
  PLANNER_DAY,
  PLANNER_COMPLETION_SUGGESTION,
  PLANNER_ITEM_ROW,
  PLANNER_PARSE_RESULT,
  PLANNER_PREFERENCES,
  PLANNER_RANGE,
  PLANNER_STATS,
  SIGNAL_SOURCES,
  triggerCatalogue,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import { plannerCoreRoutes } from '../../src/server/handlers/planner';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T08:00:00.000Z');
const BRUSH_ID = '00000000-0000-4000-8000-000000000b01';

const PREFERENCES: PlannerPreferences = PLANNER_PREFERENCES.parse({
  general: {
    week_start: 1,
    day_start: '06:00',
    day_end: '23:00',
    working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    shown_profile_id: null,
  },
  day_planner: {
    fade: 'soft',
    show_happened: true,
    show_sleep: true,
    show_weather: true,
    missed_scope: 'today',
  },
  tasks: { default_collection_id: null, smart_lists: ['today'], suggest_completion: true },
  calendar: {
    default_view: 'week',
    default_reminders: [],
    show_tasks: true,
    show_alarms: true,
    show_sleep: true,
    show_free_time: false,
  },
  clock: {
    sound: 'default',
    ramp_seconds: 30,
    snooze_minutes: 9,
    targets: [],
    wake_scene_id: null,
    world_clocks: [],
  },
  watch: { watch_alarm_sync: true, watch_calendar_push: true },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: true },
});

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let core: ReturnType<typeof plannerCoreRoutes>;
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

const collection = async (
  person: TestPerson,
  kind: 'calendar' | 'list',
  name: string,
): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, person, {
      body: { kind, name, colour: 'work', icon: 'briefcase' },
    }),
  );

const item = async (person: TestPerson, body: object): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(await call(items.createPlannerItem, person, { body }));

const meeting = (collectionId: string, start: string, end: string): object => ({
  collection_id: collectionId,
  kind: 'event',
  title: 'Meeting',
  start_local: start,
  end_local: end,
  time_zone: 'UTC',
});

const catalogue = triggerCatalogue(
  SIGNAL_SOURCES,
  {
    devices: [
      {
        id: BRUSH_ID,
        name: 'Oral-B iO9',
        model: 'oralb.toothbrush.io9',
        kind: 'other',
        roomId: null,
        capabilities: [],
      },
    ],
    rooms: [],
    people: [],
    chats: [],
  },
  [],
);

beforeEach(async () => {
  test = await testStore(() => NOW);
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  const context = { store: test.store };
  core = plannerCoreRoutes(context, {
    now: () => NOW,
    preferencesOf: () => PREFERENCES,
    catalogueOf: () => catalogue,
  });
  items = plannerItemRoutes(context, () => NOW);
  collections = plannerCollectionRoutes(context);
});

afterEach(async () => {
  await test.close();
});

describe('day', () => {
  it('composes the day of the caller and keeps another member out', async () => {
    const work = await collection(ann, 'calendar', 'Work');
    await item(ann, meeting(work.id, '2026-11-07T09:00', '2026-11-07T10:00'));
    const mine = PLANNER_DAY.parse(
      await call(core.readPlannerDay, ann, { query: { date: '2026-11-07' } }),
    );
    expect(mine.upcoming.map((view) => view.title)).toEqual(['Meeting']);
    const theirs = PLANNER_DAY.parse(
      await call(core.readPlannerDay, bob, { query: { date: '2026-11-07' } }),
    );
    expect(theirs.upcoming).toEqual([]);
  });

  it('lets the owner read for a person and refuses a member reading for another', async () => {
    await expect(
      call(core.readPlannerDay, ann, {
        query: { date: '2026-11-07', personId: bob.profileId },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      call(core.readPlannerDay, owner, {
        query: { date: '2026-11-07', personId: ann.profileId },
      }),
    ).resolves.toBeDefined();
  });
});

describe('range', () => {
  const titles = async (person: TestPerson, query: object): Promise<string[]> =>
    PLANNER_RANGE.parse(await call(core.readPlannerRange, person, { query }))
      .occurrences.map((view) => view.title)
      .sort();

  it('returns the occurrences of the window for the chosen calendars only', async () => {
    const work = await collection(ann, 'calendar', 'Work');
    const home = await collection(ann, 'calendar', 'Home');
    await item(ann, meeting(work.id, '2026-11-07T09:00', '2026-11-07T10:00'));
    await item(ann, {
      ...meeting(home.id, '2026-11-07T11:00', '2026-11-07T12:00'),
      title: 'Dinner',
    });
    const query = { from: '2026-11-07T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' };
    expect(await titles(ann, query)).toEqual(['Dinner', 'Meeting']);
    expect(await titles(ann, { ...query, collections: home.id })).toEqual(['Dinner']);
    expect(await titles(bob, query)).toEqual([]);
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(
      call(core.readPlannerRange, ann, {
        query: { from: '2026-11-08T00:00:00.000Z', to: '2026-11-07T00:00:00.000Z' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('stats', () => {
  it('counts only the caller own tasks', async () => {
    const list = await collection(ann, 'list', 'Inbox');
    await item(ann, {
      collection_id: list.id,
      kind: 'task',
      title: 'Pay rent',
      due_date: '2026-11-05',
    });
    const stats = async (person: TestPerson): Promise<z.infer<typeof PLANNER_STATS>> =>
      PLANNER_STATS.parse(await call(core.readPlannerStats, person, { query: { range: 'week' } }));
    const mine = await stats(ann);
    expect(mine.range).toBe('week');
    expect(mine.completion.due).toBe(1);
    expect((await stats(bob)).completion.due).toBe(0);
  });
});

describe('parse', () => {
  it('reads the text into a draft placed on the named list', async () => {
    await collection(ann, 'list', 'Inbox');
    const health = await collection(ann, 'list', 'Health');
    const result = PLANNER_PARSE_RESULT.parse(
      await call(core.parsePlannerText, ann, {
        body: { text: 'brush teeth every day 07:30 #health !2' },
      }),
    );
    expect(result.draft).toMatchObject({
      collection_id: health.id,
      title: 'brush teeth',
      priority: 2,
    });
    expect(result.repeat_text).toBe('Every day at 07:30');
  });

  it('answers a clear error when the person has no calendar or list', async () => {
    await expect(
      call(core.parsePlannerText, ann, { body: { text: 'brush teeth' } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses a collection of another person', async () => {
    const bobs = await collection(bob, 'list', 'Bob list');
    await collection(ann, 'list', 'Inbox');
    await expect(
      call(core.parsePlannerText, ann, { body: { text: 'brush teeth', collection_id: bobs.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suggest completion', () => {
  it('offers the toothbrush rule for brush teeth', async () => {
    const [suggestion] = z
      .array(PLANNER_COMPLETION_SUGGESTION)
      .parse(await call(core.suggestPlannerCompletion, ann, { body: { title: 'brush teeth' } }));
    expect(suggestion?.label).toBe('Oral-B iO9 finishes a brushing session');
  });
});

describe('free slots', () => {
  it('lists the stretches between the caller own events', async () => {
    const work = await collection(ann, 'calendar', 'Work');
    await item(ann, meeting(work.id, '2026-11-07T09:00', '2026-11-07T10:00'));
    const body = { from: '2026-11-07T08:00:00.000Z', to: '2026-11-07T12:00:00.000Z', minutes: 60 };
    expect(await call(core.plannerFreeSlots, ann, { body })).toEqual([
      { from: '2026-11-07T08:00:00.000Z', to: '2026-11-07T09:00:00.000Z', minutes: 60 },
      { from: '2026-11-07T10:00:00.000Z', to: '2026-11-07T12:00:00.000Z', minutes: 120 },
    ]);
    expect(await call(core.plannerFreeSlots, bob, { body })).toEqual([
      { from: body.from, to: body.to, minutes: 240 },
    ]);
  });
});

describe('proposals', () => {
  const proposal = async (): Promise<PlannerItemRow> => {
    const list = await collection(ann, 'list', 'Inbox');
    const made = await item(ann, { collection_id: list.id, kind: 'task', title: 'Stretch' });
    return test.store.plannerItems.update(made.id, ann.profileId, { status: 'proposed' });
  };

  it('accepts a proposal into an open item', async () => {
    const proposed = await proposal();
    const accepted = PLANNER_ITEM_ROW.parse(
      await call(core.acceptPlannerProposal, ann, { params: { id: proposed.id } }),
    );
    expect(accepted.status).toBe('open');
  });

  it('rejects a proposal by removing it', async () => {
    const proposed = await proposal();
    await call(core.rejectPlannerProposal, ann, { params: { id: proposed.id } });
    expect(test.store.plannerItems.find(proposed.id, ann.profileId)).toBeUndefined();
  });

  it('keeps a proposal from another member out of reach', async () => {
    const proposed = await proposal();
    await expect(
      call(core.acceptPlannerProposal, bob, { params: { id: proposed.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
