import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Input } from './api.ts';
import { dayKey, daysAgo, DAY_MS, HOUR_MS } from './clock.ts';
import type { Counted, PersonRef, SeedContext } from './context.ts';
import type { Random } from './random.ts';

const EVENT_TITLES = [
  'Team sync',
  'Dentist',
  'Lunch with Jo',
  'School pickup',
  'Gym',
  'Piano lesson',
  'Dinner reservation',
  'Car service',
  'Parents evening',
  'Book club',
  'Yoga class',
  'Planning session',
  'Haircut',
  'Vet appointment',
];

const TASK_TITLES = [
  'Pay electricity bill',
  'Book flights',
  'Renew passport',
  'Water the plants',
  'Reply to landlord',
  'Order printer ink',
  'Back up photos',
  'Fix bike tyre',
  'Plan weekend trip',
  'Call the plumber',
  'Clean the filters',
  'Update the budget',
];

const SHOPPING = [
  'Milk',
  'Eggs',
  'Bread',
  'Tomatoes',
  'Olive oil',
  'Coffee beans',
  'Dish soap',
  'Bananas',
  'Greek yoghurt',
  'Pasta',
  'Chicken thighs',
  'Spinach',
];

const RRULES = [
  'FREQ=WEEKLY;BYDAY=MO,WE',
  'FREQ=WEEKLY;BYDAY=TH',
  'FREQ=DAILY;COUNT=30',
  'FREQ=MONTHLY;BYMONTHDAY=1',
  'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
];

function localTime(base: Date, hour: number): string {
  const moment = new Date(base.getTime() + hour * HOUR_MS);
  return moment.toISOString().slice(0, 19);
}

async function collectionsOf(
  context: SeedContext,
  person: PersonRef,
): Promise<{ calendars: string[]; lists: string[] }> {
  const { api } = context;
  const query = { personId: person.id };
  const make = async (
    kind: 'calendar' | 'list',
    name: string,
    colour: 'work' | 'family' | 'personal' | 'health' | 'home' | 'shopping',
    icon: string,
  ): Promise<string> =>
    (
      await api.call(E.createPlannerCollection, {
        query,
        body: {
          kind,
          name,
          colour,
          icon,
          visible: true,
          default_reminders: [{ minutes_before: 10 }],
        },
      })
    ).id;
  return {
    calendars: [
      await make('calendar', `${person.name} personal`, 'personal', 'calendar'),
      await make('calendar', `${person.name} work`, 'work', 'briefcase'),
      await make('calendar', `${person.name} health`, 'health', 'heart'),
    ],
    lists: [
      await make('list', `${person.name} tasks`, 'home', 'check'),
      await make('list', `${person.name} shopping`, 'shopping', 'cart'),
    ],
  };
}

type ItemBody = NonNullable<Input<typeof E.createPlannerItem>['body']>;

function eventBody(rng: Random, calendar: string, base: Date): ItemBody {
  const hour = rng.int(7, 19);
  const minutes = rng.pick([30, 45, 60, 90, 120]);
  const allDay = rng.chance(0.08);
  return {
    collection_id: calendar,
    kind: 'event',
    title: rng.pick(EVENT_TITLES),
    notes: rng.chance(0.3) ? 'Synthetic test event.' : '',
    location: rng.chance(0.3) ? rng.pick(['Home', 'Office', 'Town centre', 'Clinic']) : null,
    priority: null,
    tags: rng.chance(0.2) ? ['seed'] : [],
    start_local: allDay ? dayKey(base) : localTime(base, hour),
    end_local: allDay
      ? dayKey(new Date(base.getTime() + DAY_MS))
      : localTime(base, hour + minutes / 60),
    time_zone: allDay ? null : 'UTC',
    all_day: allDay,
    rrule: !allDay && rng.chance(0.1) ? rng.pick(RRULES) : null,
    reminders: [{ minutes_before: rng.pick([5, 10, 30]) }],
  };
}

async function eventsOf(
  context: SeedContext,
  person: PersonRef,
  calendars: readonly string[],
  rng: Random,
): Promise<number> {
  let count = 0;
  for (let day = -75; day <= 75; day += 1) {
    if (!rng.chance(0.55)) continue;
    const body = eventBody(rng, rng.pick(calendars), daysAgo(context.anchor, -day));
    await context.api.call(E.createPlannerItem, { query: { personId: person.id }, body });
    count += 1;
  }
  return count;
}

async function tasksOf(
  context: SeedContext,
  person: PersonRef,
  lists: readonly string[],
  rng: Random,
): Promise<number> {
  const { api, anchor } = context;
  const [tasks, shopping] = lists;
  if (tasks === undefined || shopping === undefined) throw new Error('Missing lists.');
  let count = 0;
  const query = { personId: person.id };
  for (const title of TASK_TITLES) {
    const due = daysAgo(anchor, rng.int(-30, 14));
    const row = await api.call(E.createPlannerItem, {
      query,
      body: {
        collection_id: tasks,
        kind: 'task',
        title,
        notes: rng.chance(0.3) ? 'Synthetic test task.' : '',
        priority: rng.pick([1, 2, 3, null] as const),
        tags: rng.chance(0.25) ? ['seed', 'home'] : [],
        due_date: dayKey(due),
        estimate_minutes: rng.pick([15, 30, 60, null] as const),
      },
    });
    count += 1;
    if (due.getTime() < anchor.now.getTime() && rng.chance(0.6)) {
      await api.call(E.completePlannerItem, {
        query,
        params: { itemId: row.id },
        body: { occurrence_key: 'single' },
      });
    }
  }
  for (const title of SHOPPING) {
    const row = await api.call(E.createPlannerItem, {
      query,
      body: { collection_id: shopping, kind: 'task', title, tags: [] },
    });
    count += 1;
    if (rng.chance(0.4))
      await api.call(E.completePlannerItem, {
        query,
        params: { itemId: row.id },
        body: { occurrence_key: 'single' },
      });
  }
  return count;
}

async function alarmsOf(context: SeedContext, person: PersonRef, rng: Random): Promise<number> {
  const { api } = context;
  const query = { personId: person.id };
  const alarms: readonly { time: string; label: string; days: readonly number[] }[] = [
    { time: '06:45', label: 'Wake up', days: [1, 2, 3, 4, 5] },
    { time: '08:30', label: 'Weekend wake up', days: [0, 6] },
    { time: `${String(rng.int(9, 21)).padStart(2, '0')}:00`, label: 'Take vitamins', days: [] },
  ];
  for (const alarm of alarms) {
    await api.call(E.createPlannerAlarm, {
      query,
      body: {
        time: alarm.time,
        label: alarm.label,
        days: [...alarm.days],
        enabled: alarm.label !== 'Take vitamins',
      },
    });
  }
  return alarms.length;
}

async function timersOf(context: SeedContext, person: PersonRef, rng: Random): Promise<number> {
  const timers: readonly { minutes: number; label: string | null }[] = [
    { minutes: 10, label: 'Tea' },
    { minutes: rng.int(20, 45), label: 'Laundry' },
    { minutes: 90, label: null },
  ];
  for (const timer of timers) {
    await context.api.call(E.startPlannerTimer, {
      query: { personId: person.id },
      body: { duration_ms: timer.minutes * 60_000, label: timer.label },
    });
  }
  return timers.length;
}

interface Invited {
  readonly guests: number;
  readonly answers: number;
}

interface InviteScene {
  readonly owner: PersonRef;
  readonly members: readonly PersonRef[];
  readonly calendar: string;
}

async function invitesOf(context: SeedContext, scene: InviteScene, rng: Random): Promise<Invited> {
  const { owner, members, calendar } = scene;
  const { api, anchor } = context;
  const answers = ['yes', 'no', 'maybe'] as const;
  let guests = 0;
  let responses = 0;
  for (const [index, title] of ['Family dinner', 'Movie night', 'Birthday lunch'].entries()) {
    const base = daysAgo(anchor, -(index * 3 + 2));
    const item = await api.call(E.createPlannerItem, {
      query: { personId: owner.id },
      body: { ...eventBody(rng, calendar, base), title, all_day: false, rrule: null },
    });
    await api.call(E.setPlannerGuests, {
      query: { personId: owner.id },
      params: { itemId: item.id },
      body: {
        guests: members.map((member) => ({ kind: 'person' as const, profile_id: member.id })),
      },
    });
    guests += members.length;
    for (const [position, member] of members.entries()) {
      await api.call(E.respondPlannerInvite, {
        query: { personId: member.id },
        params: { itemId: item.id },
        body: { response: answers[(index + position) % answers.length] ?? 'yes', note: null },
      });
      responses += 1;
    }
  }
  return { guests, answers: responses };
}

async function schedulesOf(context: SeedContext, rng: Random): Promise<number> {
  const { api, anchor } = context;
  let count = 0;
  for (let index = 0; index < 4; index += 1) {
    const at = new Date(anchor.now.getTime() + (index + 2) * DAY_MS + rng.int(0, 10) * HOUR_MS);
    await api.call(E.createSchedule, {
      body: {
        label: `Test reminder ${String(index + 1)}`,
        timing: { kind: 'at', at: at.toISOString() },
        steps: [{ kind: 'wait', seconds: 1 }],
      },
    });
    count += 1;
  }
  return count;
}

interface Shared {
  readonly owner: PersonRef;
  readonly members: readonly PersonRef[];
  readonly calendars: readonly string[];
  readonly lists: readonly string[];
}

async function sharingOf(context: SeedContext, shared: Shared): Promise<number> {
  const { api } = context;
  const { owner, members, calendars, lists } = shared;
  const [personal, work] = calendars;
  const [tasks] = lists;
  if (personal === undefined || work === undefined || tasks === undefined)
    throw new Error('Missing collections to share.');
  let count = 0;
  for (const [index, member] of members.entries()) {
    await api.call(E.sharePlannerCollection, {
      query: { personId: owner.id },
      params: { collectionId: personal, personId: member.id },
      body: { role: 'view' },
    });
    await api.call(E.sharePlannerCollection, {
      query: { personId: owner.id },
      params: { collectionId: tasks, personId: member.id },
      body: { role: index === 0 ? 'edit' : 'view' },
    });
    count += 2;
  }
  await api.call(E.createPlannerBookingPage, {
    query: { personId: owner.id },
    body: {
      collection_id: work,
      title: 'Book a call',
      description: 'Synthetic booking page.',
      minutes: 30,
      availability: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '12:00' })),
      buffer_before: 5,
      buffer_after: 5,
      notice_minutes: 120,
      ahead_days: 21,
      location: null,
      enabled: true,
    },
  });
  return count + 1;
}

export async function seedPlanner(context: SeedContext): Promise<Counted> {
  const counts = {
    collections: 0,
    events: 0,
    tasks: 0,
    alarms: 0,
    timers: 0,
    guests: 0,
    rsvps: 0,
    schedules: 0,
    shares: 0,
  };
  for (const person of context.people) {
    const rng = context.rng(`planner-${person.id}`);
    const { calendars, lists } = await collectionsOf(context, person);
    if (person.owner)
      counts.shares += await sharingOf(context, {
        owner: person,
        members: context.people.filter((other) => !other.owner),
        calendars,
        lists,
      });
    counts.collections += calendars.length + lists.length;
    counts.events += await eventsOf(context, person, calendars, rng);
    counts.tasks += await tasksOf(context, person, lists, rng);
    counts.alarms += await alarmsOf(context, person, rng);
    counts.timers += await timersOf(context, person, rng);
    const first = calendars[1];
    const members = context.people.filter((other) => !other.owner);
    if (person.owner && first !== undefined) {
      const invited = await invitesOf(context, { owner: person, members, calendar: first }, rng);
      counts.guests += invited.guests;
      counts.rsvps += invited.answers;
    }
  }
  counts.schedules = await schedulesOf(context, context.rng('schedules'));
  return counts;
}
