import {
  ApiError,
  PLANNER_OCCURRENCE_SINGLE,
  PLANNER_WEEKDAY,
  type JsonValue,
  type PlannerAlarmRow,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../assistant/turn-authority';
import type { Clock } from '../clock';
import { effectFailure } from '../automations/effect-failure';
import { outputs, parsed } from '../automations/engine-v3-effects';
import type { EffectHandler, EffectHandlers, EffectRun } from '../automations/effects/effect-run';
import type { IntegrationPorts } from '../automations/integration-effects';
import { awaitRun } from '../automations/effects/run-abort';
import { callTool } from '../automations/effects/tool';
import { PERSON_REF } from '../automations/world-v3/refs';
import type { Store } from '../store/store';
import { isoOf } from './instants';
import { nextRing } from './alarms';
import { expandOccurrences } from './occurrences';

export interface PlannerEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now'>;
  readonly integration: Pick<IntegrationPorts, 'tools' | 'ownerProfileId'>;
}

const MILLISECONDS_PER_MINUTE = 60_000;

const TEXT = z
  .string()
  .nullish()
  .transform((text) =>
    text === null || text === undefined || text.trim() === '' ? undefined : text,
  );

const MOMENT = z.iso.datetime({ offset: true });

const ADD_TASK = z.object({
  title: z.string().trim().min(1),
  person: PERSON_REF.optional(),
  notes: TEXT,
  due: MOMENT.nullish(),
  priority: z
    .enum(['1', '2', '3'])
    .nullish()
    .transform((value) => (value === null || value === undefined ? undefined : Number(value))),
  estimate: z.number().positive().nullish(),
});

const COMPLETE_TASK = z.object({
  itemId: z.uuid(),
  person: PERSON_REF.optional(),
});

const START_TIMER = z.object({
  duration: z.number().positive(),
  label: TEXT,
  person: PERSON_REF.optional(),
});

const SET_ALARM = z.object({
  at: z.string().regex(/^\d{2}:\d{2}$/),
  days: z.array(PLANNER_WEEKDAY).nullish(),
  label: TEXT,
  snooze: z.number().int().positive().nullish(),
  person: PERSON_REF.optional(),
});

const CREATED_ITEM = z.object({ id: z.uuid() });
const OCCURRENCE = z.object({ status: z.string() });
const TIMER = z.object({ id: z.uuid(), ends_at: MOMENT });
const ALARM = z.object({ id: z.uuid() });

function profileOf(ports: PlannerEffectPorts, person: string | undefined): string {
  const authority = currentExecutionAuthority();
  const own = authority?.profile_id ?? ports.integration.ownerProfileId();
  if (
    person !== undefined &&
    person !== own &&
    authority !== undefined &&
    executionRole(authority) !== 'owner'
  )
    throw new ApiError('forbidden', 'Members can only change their own planner.');
  return person ?? own;
}

function editArgs(
  profileId: string,
  own: string,
  args: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  return profileId === own ? args : { ...args, personId: profileId };
}

function ownerOf(ports: PlannerEffectPorts): string {
  return currentExecutionAuthority()?.profile_id ?? ports.integration.ownerProfileId();
}

function edit(
  ports: PlannerEffectPorts,
  run: EffectRun,
  profileId: string,
  args: Readonly<Record<string, JsonValue>>,
): Promise<Readonly<Record<string, JsonValue>>> {
  return awaitRun(
    callTool(
      ports.integration.tools,
      { profileId, tool: 'planner_edit', args: editArgs(profileId, ownerOf(ports), args) },
      { plugin: null },
    ),
    run,
  );
}

function taskCollection(store: Store, profileId: string): string {
  const preferred =
    store.plannerPreferences.find(profileId)?.preferences.tasks.default_collection_id;
  const collections = store.plannerCollections.list(profileId);
  const chosen =
    collections.find((collection) => collection.id === preferred) ??
    collections.find((collection) => collection.kind === 'list');
  if (chosen === undefined) throw new ApiError('invalid_request', 'Create a task list first.');
  return chosen.id;
}

function addTask(ports: PlannerEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(ADD_TASK, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const profileId = profileOf(ports, ask.person);
      const item = {
        collection_id: taskCollection(ports.store, profileId),
        kind: 'task',
        title: ask.title,
        ...(ask.notes === undefined ? {} : { notes: ask.notes }),
        ...(ask.due === null || ask.due === undefined ? {} : { due_at: ask.due }),
        ...(ask.priority === undefined ? {} : { priority: ask.priority }),
        ...(ask.estimate === null || ask.estimate === undefined
          ? {}
          : { estimate_minutes: Math.max(1, Math.round(ask.estimate / MILLISECONDS_PER_MINUTE)) }),
      };
      const created = CREATED_ITEM.parse(
        await edit(ports, run, profileId, { action: 'add', item }),
      );
      return { ok: true, value: outputs({ itemId: created.id }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function dueNow(
  ports: PlannerEffectPorts,
  item: PlannerItemRow,
): PlannerOccurrenceView | undefined {
  const now = Temporal.Instant.fromEpochMilliseconds(ports.clock.now().getTime());
  const first = item.start ?? item.due_at ?? item.created_at;
  const from = Temporal.Instant.from(first).epochMilliseconds;
  const views = expandOccurrences({
    items: [item],
    stored: ports.store.plannerOccurrences.forItems([item.id]),
    window: {
      from: Temporal.Instant.fromEpochMilliseconds(Math.min(from, now.epochMilliseconds)),
      to: now,
      timeZone: ports.store.settings.read().time_zone,
    },
    now,
  });
  return views.findLast((view) => view.status === 'open' || view.status === 'missed');
}

function occurrenceKeyOf(ports: PlannerEffectPorts, item: PlannerItemRow): string | undefined {
  if (item.rrule === null) return PLANNER_OCCURRENCE_SINGLE;
  return dueNow(ports, item)?.occurrence_key;
}

function completeTask(ports: PlannerEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(COMPLETE_TASK, params);
    if (!checked.ok) return checked;
    try {
      const profileId = profileOf(ports, checked.value.person);
      const item = ports.store.plannerItems.find(checked.value.itemId, profileId);
      if (item === undefined) throw new ApiError('not_found', 'That task is not in the planner.');
      const occurrenceKey = occurrenceKeyOf(ports, item);
      if (occurrenceKey === undefined) return { ok: true, value: outputs({ ok: false }) };
      const done = OCCURRENCE.parse(
        await edit(ports, run, profileId, {
          action: 'complete',
          itemId: item.id,
          occurrenceKey,
        }),
      );
      return { ok: true, value: outputs({ ok: done.status === 'done' }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function startTimer(ports: PlannerEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(START_TIMER, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const profileId = profileOf(ports, ask.person);
      const timer = TIMER.parse(
        await edit(ports, run, profileId, {
          action: 'timer_start',
          timer: {
            duration_ms: Math.round(ask.duration),
            ...(ask.label === undefined ? {} : { label: ask.label }),
          },
        }),
      );
      return { ok: true, value: outputs({ timerId: timer.id, endsAt: timer.ends_at }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function onceDate(ports: PlannerEffectPorts, time: string): string {
  const zone = ports.store.settings.read().time_zone;
  const now = ports.clock.now();
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate();
  const next = nextRing({ time, days: [], once_on: null, skip_on: null }, now, zone);
  const date =
    next === null
      ? today
      : Temporal.Instant.fromEpochMilliseconds(next.getTime())
          .toZonedDateTimeISO(zone)
          .toPlainDate();
  return date.toString();
}

function alarmOf(
  ports: PlannerEffectPorts,
  ask: z.infer<typeof SET_ALARM>,
): Readonly<Record<string, JsonValue>> {
  const days = ask.days ?? [];
  return {
    time: ask.at,
    days,
    ...(days.length === 0 ? { once_on: onceDate(ports, ask.at) } : {}),
    ...(ask.label === undefined ? {} : { label: ask.label }),
    ...(ask.snooze === null || ask.snooze === undefined ? {} : { snooze_minutes: ask.snooze }),
  };
}

function nextAt(ports: PlannerEffectPorts, alarm: PlannerAlarmRow): string | null {
  const next = nextRing(alarm, ports.clock.now(), ports.store.settings.read().time_zone);
  return next === null ? null : isoOf(Temporal.Instant.fromEpochMilliseconds(next.getTime()));
}

function setAlarm(ports: PlannerEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(SET_ALARM, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const profileId = profileOf(ports, ask.person);
      const created = ALARM.parse(
        await edit(ports, run, profileId, { action: 'alarm_set', alarm: alarmOf(ports, ask) }),
      );
      const row = ports.store.plannerAlarms.byId(created.id, profileId);
      return { ok: true, value: outputs({ alarmId: row.id, nextAt: nextAt(ports, row) }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function plannerEffects(ports: PlannerEffectPorts): EffectHandlers {
  return {
    'planner.add_task': addTask(ports),
    'planner.complete_task': completeTask(ports),
    'planner.start_timer': startTimer(ports),
    'planner.set_alarm': setAlarm(ports),
  };
}
