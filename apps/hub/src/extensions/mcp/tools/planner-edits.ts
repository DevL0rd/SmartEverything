import {
  PLANNER_ALARM_CHANGES,
  PLANNER_ALARM_CREATE,
  PLANNER_EDIT_ACTIONS,
  PLANNER_ITEM_CHANGES,
  PLANNER_ITEM_CREATE,
  PLANNER_ITEM_SCOPES,
  PLANNER_OCCURRENCE_KEY,
  PLANNER_TIMER_START,
  type EndpointName,
  type PlannerItemCreate,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { instantsOf } from '../../../planner/instants';
import { operate, profileFor, type ActingContext } from './acting';
import { MOMENT_ARGUMENT, PERSON, WRITES } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

type OccurrenceKey = z.infer<typeof PLANNER_OCCURRENCE_KEY>;

const ITEM_ID = z.uuid();
const OCCURRENCE = PLANNER_OCCURRENCE_KEY.optional();
const STOPWATCH_STEPS = ['start', 'pause', 'lap', 'reset'] as const;

const STOPWATCH_OPERATIONS: Readonly<Record<(typeof STOPWATCH_STEPS)[number], EndpointName>> = {
  start: 'startPlannerStopwatch',
  pause: 'pausePlannerStopwatch',
  lap: 'lapPlannerStopwatch',
  reset: 'resetPlannerStopwatch',
};

export const PLANNER_EDIT_INPUT = z.strictObject({
  action: z.enum(PLANNER_EDIT_ACTIONS).describe('What to change'),
  personId: PERSON,
  item: PLANNER_ITEM_CREATE.optional().describe('The new task or event for action add'),
  items: z
    .array(PLANNER_ITEM_CREATE)
    .min(1)
    .optional()
    .describe('Drafts the person accepts or rejects, for action propose'),
  itemId: ITEM_ID.optional().describe('The task or event id from planner_read'),
  changes: PLANNER_ITEM_CHANGES.optional().describe('The fields to change for action update'),
  scope: z
    .enum(PLANNER_ITEM_SCOPES)
    .optional()
    .describe('this, following or all occurrences of a repeating item; all when left out'),
  occurrenceKey: OCCURRENCE.describe(
    'The occurrence of a repeating item: a date for an all-day item and a moment otherwise; single when left out',
  ),
  start: MOMENT_ARGUMENT.optional().describe('The new start for action move'),
  end: MOMENT_ARGUMENT.nullable().optional().describe('The new end for action move'),
  alarm: PLANNER_ALARM_CREATE.optional().describe('The new alarm for action alarm_set'),
  alarmId: z.uuid().optional().describe('The alarm to change or remove'),
  alarmChanges: PLANNER_ALARM_CHANGES.optional().describe('The alarm fields to change'),
  timer: PLANNER_TIMER_START.optional().describe('The timer to start for action timer_start'),
  timerId: z.uuid().optional().describe('The timer to stop for action timer_stop'),
  stopwatch: z.enum(STOPWATCH_STEPS).optional().describe('What the stopwatch does'),
});

function occurrence(key: OccurrenceKey | undefined): { readonly occurrence_key?: unknown } {
  return key === undefined ? {} : { occurrence_key: key };
}

function nextPosition(positions: readonly { readonly position: number }[]): number {
  return positions.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

function proposed(
  context: ActingContext,
  profileId: string,
  draft: PlannerItemCreate,
): PlannerItemRow {
  const { store } = context;
  store.plannerCollections.byId(draft.collection_id, profileId);
  return store.plannerItems.insert({
    ...draft,
    ...instantsOf(draft),
    position:
      draft.position ??
      nextPosition(store.plannerItems.list(profileId, { collectionIds: [draft.collection_id] })),
    profile_id: profileId,
    series_id: null,
    original_start: null,
    status: 'proposed',
    google: null,
    created_by: 'ai',
  });
}

function add(): Selection {
  return selection({
    input: z.strictObject({ item: PLANNER_ITEM_CREATE }),
    run: (context, input, as) => operate(context, 'createPlannerItem', { body: input.item }, as),
  });
}

function propose(): Selection {
  return selection({
    input: z.strictObject({ items: z.array(PLANNER_ITEM_CREATE).min(1) }),
    run: (context, input, as) => {
      const profileId = profileFor(context, as);
      return context.store.write(() =>
        input.items.map((draft) => proposed(context, profileId, draft)),
      );
    },
  });
}

function update(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      changes: PLANNER_ITEM_CHANGES,
      scope: z.enum(PLANNER_ITEM_SCOPES).optional(),
      occurrenceKey: OCCURRENCE,
    }),
    run: (context, input, as) =>
      operate(
        context,
        'updatePlannerItem',
        {
          params: { itemId: input.itemId },
          body: {
            changes: input.changes,
            ...(input.scope === undefined ? {} : { scope: input.scope }),
            ...occurrence(input.occurrenceKey),
          },
        },
        as,
      ),
  });
}

function occurrenceAction(name: 'completePlannerItem' | 'skipPlannerItem'): Selection {
  return selection({
    input: z.strictObject({ itemId: ITEM_ID, occurrenceKey: OCCURRENCE }),
    run: (context, input, as) =>
      operate(
        context,
        name,
        { params: { itemId: input.itemId }, body: occurrence(input.occurrenceKey) },
        as,
      ),
  });
}

function move(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      occurrenceKey: OCCURRENCE,
      start: MOMENT_ARGUMENT,
      end: MOMENT_ARGUMENT.nullable().optional(),
    }),
    run: (context, input, as) =>
      operate(
        context,
        'movePlannerItem',
        {
          params: { itemId: input.itemId },
          body: {
            start: input.start,
            ...(input.end === undefined ? {} : { end: input.end }),
            ...occurrence(input.occurrenceKey),
          },
        },
        as,
      ),
  });
}

function remove(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      scope: z.enum(PLANNER_ITEM_SCOPES).optional(),
      occurrenceKey: OCCURRENCE,
    }),
    run: async (context, input, as) => {
      await operate(
        context,
        'deletePlannerItem',
        {
          params: { itemId: input.itemId },
          query: {
            ...(input.scope === undefined ? {} : { scope: input.scope }),
            ...occurrence(input.occurrenceKey),
          },
        },
        as,
      );
      return { removed: input.itemId };
    },
  });
}

const ALARM_SET = z.union([
  z.strictObject({ alarm: PLANNER_ALARM_CREATE }),
  z.strictObject({ alarmId: z.uuid(), alarmChanges: PLANNER_ALARM_CHANGES }),
]);

function alarmSet(): Selection {
  return selection({
    input: ALARM_SET,
    run: (context, input, as) =>
      'alarm' in input
        ? operate(context, 'createPlannerAlarm', { body: input.alarm }, as)
        : operate(
            context,
            'updatePlannerAlarm',
            { params: { alarmId: input.alarmId }, body: input.alarmChanges },
            as,
          ),
  });
}

function alarmRemove(): Selection {
  return selection({
    input: z.strictObject({ alarmId: z.uuid() }),
    run: async (context, input, as) => {
      await operate(context, 'deletePlannerAlarm', { params: { alarmId: input.alarmId } }, as);
      return { removed: input.alarmId };
    },
  });
}

function timerStart(): Selection {
  return selection({
    input: z.strictObject({ timer: PLANNER_TIMER_START }),
    run: (context, input, as) => operate(context, 'startPlannerTimer', { body: input.timer }, as),
  });
}

function timerStop(): Selection {
  return selection({
    input: z.strictObject({ timerId: z.uuid() }),
    run: (context, input, as) =>
      operate(context, 'cancelPlannerTimer', { params: { timerId: input.timerId } }, as),
  });
}

function stopwatch(): Selection {
  return selection({
    input: z.strictObject({ stopwatch: z.enum(STOPWATCH_STEPS) }),
    run: (context, input, as) => operate(context, STOPWATCH_OPERATIONS[input.stopwatch], {}, as),
  });
}

export const PLANNER_EDIT: SelectedToolDefinition = {
  name: 'planner_edit',
  selector: 'action',
  input: PLANNER_EDIT_INPUT,
  annotations: { ...WRITES, destructiveHint: true },
  action: true,
  selections: {
    add: add(),
    update: update(),
    complete: occurrenceAction('completePlannerItem'),
    skip: occurrenceAction('skipPlannerItem'),
    move: move(),
    remove: remove(),
    propose: propose(),
    alarm_set: alarmSet(),
    alarm_remove: alarmRemove(),
    timer_start: timerStart(),
    timer_stop: timerStop(),
    stopwatch: stopwatch(),
  },
};
