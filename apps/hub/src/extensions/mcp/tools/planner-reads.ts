import {
  PLANNER_LOCAL_DATE,
  PLANNER_READ_VIEWS,
  PLANNER_STATS_RANGES,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, profileFor, type ActingAs, type ActingContext } from './acting';
import { MOMENT_ARGUMENT, PERSON, READS } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

const COLLECTIONS = z.array(z.uuid()).min(1);

const READ_FIELDS = {
  date: PLANNER_LOCAL_DATE,
  from: MOMENT_ARGUMENT,
  to: MOMENT_ARGUMENT,
  collections: COLLECTIONS,
  itemId: z.uuid(),
  range: z.enum(PLANNER_STATS_RANGES),
  minutes: z.int().positive(),
} as const;

export const PLANNER_READ_INPUT = z.strictObject({
  view: z.enum(PLANNER_READ_VIEWS).describe('What to read'),
  personId: PERSON,
  date: READ_FIELDS.date.optional().describe('The day for view day, as YYYY-MM-DD'),
  from: READ_FIELDS.from.optional().describe('Start moment for range and free_slots'),
  to: READ_FIELDS.to.optional().describe('End moment for range and free_slots'),
  collections: READ_FIELDS.collections
    .optional()
    .describe('Calendar or list ids to keep, from view tasks; all when left out'),
  itemId: READ_FIELDS.itemId.optional().describe('The task or event id for view item'),
  range: READ_FIELDS.range.optional().describe('week, month or year for view stats'),
  minutes: READ_FIELDS.minutes.optional().describe('Length in minutes the gap must fit'),
});

function listed<T>(rows: readonly T[]): { readonly rows: readonly T[] } {
  return { rows };
}

function day(): Selection {
  return selection({
    input: z.strictObject({ date: READ_FIELDS.date }),
    run: (context, input, as) =>
      operate(context, 'readPlannerDay', { query: { date: input.date } }, as),
  });
}

function range(): Selection {
  return selection({
    input: z.strictObject({
      from: READ_FIELDS.from,
      to: READ_FIELDS.to,
      collections: READ_FIELDS.collections.optional(),
    }),
    run: (context, input, as) =>
      operate(
        context,
        'readPlannerRange',
        {
          query: {
            from: input.from,
            to: input.to,
            ...(input.collections === undefined ? {} : { collections: input.collections }),
          },
        },
        as,
      ),
  });
}

function tasks(): Selection {
  return selection({
    input: z.strictObject({ collections: READ_FIELDS.collections.optional() }),
    run: (context, input, as) => {
      const profileId = profileFor(context, as);
      return {
        collections: context.store.plannerCollections.list(profileId),
        tasks: context.store.plannerItems.list(profileId, {
          kind: 'task',
          statuses: ['open'],
          collectionIds: input.collections,
        }),
      };
    },
  });
}

function item(): Selection {
  return selection({
    input: z.strictObject({ itemId: READ_FIELDS.itemId }),
    run: (context, input, as) => {
      const profileId = profileFor(context, as);
      return {
        item: context.store.plannerItems.byId(input.itemId, profileId),
        children: context.store.plannerItems.children(input.itemId, profileId),
      };
    },
  });
}

function nothing(read: (context: ActingContext, as: ActingAs) => unknown): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => read(context, as),
  });
}

function stats(): Selection {
  return selection({
    input: z.strictObject({ range: READ_FIELDS.range }),
    run: (context, input, as) =>
      operate(context, 'readPlannerStats', { query: { range: input.range } }, as),
  });
}

function freeSlots(): Selection {
  return selection({
    input: z.strictObject({
      from: READ_FIELDS.from,
      to: READ_FIELDS.to,
      minutes: READ_FIELDS.minutes,
    }),
    run: (context, input, as) => operate(context, 'plannerFreeSlots', { body: input }, as),
  });
}

export const PLANNER_READ: SelectedToolDefinition = {
  name: 'planner_read',
  selector: 'view',
  input: PLANNER_READ_INPUT,
  annotations: READS,
  action: false,
  selections: {
    day: day(),
    range: range(),
    tasks: tasks(),
    item: item(),
    alarms: nothing((context, as) =>
      listed(context.store.plannerAlarms.list(profileFor(context, as))),
    ),
    timers: nothing((context, as) => {
      const profileId = profileFor(context, as);
      return {
        timers: context.store.plannerTimers.list(profileId),
        stopwatch: context.store.plannerStopwatch.find(profileId) ?? null,
      };
    }),
    stats: stats(),
    free_slots: freeSlots(),
    google_status: nothing((context, as) => {
      const account = context.store.googleAccounts.find(profileFor(context, as));
      return { linked: account !== undefined, account: account ?? null };
    }),
  },
};
