import { PLANNER_READ_VIEWS } from '@smarteverything/domain';
import { z } from 'zod';
import { operate, profileFor, type ActingAs, type ActingContext } from './acting';
import { bedtime, sleep } from './planner-reads-clock';
import { bookingPages, feeds, guests, search, sharing } from './planner-reads-calendar';
import { READ_FIELDS } from './planner-reads-fields';
import { PERSON, READS } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

export const PLANNER_READ_INPUT = z.strictObject({
  view: z.enum(PLANNER_READ_VIEWS).describe('What to read'),
  personId: PERSON,
  date: READ_FIELDS.date.optional().describe('The day for view day, as YYYY-MM-DD'),
  from: READ_FIELDS.from.optional().describe('Start moment for range, free_slots and sleep'),
  to: READ_FIELDS.to.optional().describe('End moment for range, free_slots and sleep'),
  collections: READ_FIELDS.collections
    .optional()
    .describe('Calendar or list ids to keep, for views tasks, range and search; all when left out'),
  itemId: READ_FIELDS.itemId.optional().describe('The task or event id for views item and guests'),
  range: READ_FIELDS.range.optional().describe('week, month or year for view stats'),
  minutes: READ_FIELDS.minutes.optional().describe('Length in minutes the gap must fit'),
  text: READ_FIELDS.text.optional().describe('The words to look for, for view search'),
  when: READ_FIELDS.when
    .optional()
    .describe('all, upcoming or past events for view search; all when left out'),
  kinds: READ_FIELDS.kinds.optional().describe('event and or task to keep, for view search'),
  cursor: READ_FIELDS.cursor.optional().describe('The next value of the previous search page'),
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
    run: async (context, input, as) =>
      context.store.host.read('mcpPlannerTasks', {
        profileId: await profileFor(context, as),
        collections: input.collections,
      }),
  });
}

function item(): Selection {
  return selection({
    input: z.strictObject({ itemId: READ_FIELDS.itemId }),
    run: async (context, input, as) =>
      context.store.host.read('mcpPlannerItem', {
        profileId: await profileFor(context, as),
        itemId: input.itemId,
      }),
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
    alarms: nothing(async (context, as) =>
      listed(await context.store.host.call('plannerAlarms', 'list', await profileFor(context, as))),
    ),
    timers: nothing(async (context, as) =>
      context.store.host.read('mcpPlannerTimers', await profileFor(context, as)),
    ),
    stats: stats(),
    free_slots: freeSlots(),
    search: search(),
    sharing: sharing(),
    guests: guests(),
    feeds: feeds(),
    booking_pages: bookingPages(),
    bedtime: bedtime(),
    sleep: sleep(),
    google_status: nothing(async (context, as) => {
      const account = await context.store.host.call(
        'googleAccounts',
        'find',
        await profileFor(context, as),
      );
      return { linked: account !== undefined, account: account ?? null };
    }),
  },
};
