import {
  API_ENDPOINTS as E,
  ApiError,
  PLANNER_ALARM_CHANGES,
  type PlannerPhoneRingSet,
  type PlannerPreferences,
  type PlannerRingRow,
  type PlannerRingTarget,
} from '@smarteverything/domain';
import { ZodError, type z } from 'zod';
import { nextRing, type AlarmScheduler } from '../../planner/alarms';
import type { PhoneRingSet, PhoneRings } from '../../planner/phone-rings';
import type { StopwatchService } from '../../planner/stopwatch';
import type { TimerService } from '../../planner/timers';
import type { PlannerAlarmPatch } from '../../store/repositories/planner-alarms';
import type { Store } from '../../store/store';
import type { Caller } from '../auth';
import { invalid } from '../errors';
import { assertDevicesReach } from '../person-scope';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { sceneDeviceIds } from '../snapshot-reach';
import { plannerProfileOf, type PlannerContext } from './planner-items';

export interface PlannerClockDependencies {
  readonly now: () => Date;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly alarms: Pick<AlarmScheduler, 'skipNext' | 'snooze' | 'dismiss'>;
  readonly timers: Pick<TimerService, 'begin' | 'pause' | 'resume' | 'addTime' | 'cancelTimer'>;
  readonly stopwatch: Pick<StopwatchService, 'begin' | 'pause' | 'lap' | 'reset'>;
  readonly phoneRings: Pick<PhoneRings, 'desired' | 'acknowledge'>;
}

function validated<T>(what: string, work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof ZodError) throw invalid(what, cause);
    throw cause;
  }
}

function alarmPatch(changes: z.infer<typeof PLANNER_ALARM_CHANGES>): PlannerAlarmPatch {
  const patch: PlannerAlarmPatch = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined) Object.assign(patch, { [field]: value });
  }
  return patch;
}

function requireTargets(store: Store, targets: readonly PlannerRingTarget[] | undefined): void {
  for (const target of targets ?? []) {
    const known =
      target.kind === 'client'
        ? store.clients.find(target.clientId)
        : store.devices.find(target.deviceId);
    if (known === undefined) {
      throw new ApiError('not_found', 'A place the alarm should ring on does not exist.');
    }
  }
}

function requireScene(
  context: PlannerContext,
  caller: Caller,
  sceneId: string | null | undefined,
): void {
  if (sceneId === null || sceneId === undefined) return;
  const scene = context.store.scenes.byId(sceneId);
  assertDevicesReach(context.store, caller, sceneDeviceIds(scene.actions));
}

function ringOf(
  context: PlannerContext,
  profileId: string,
  alarmId: string,
  ringId: string,
): PlannerRingRow {
  const ring = context.store.plannerRings.find(ringId);
  if (ring?.profile_id !== profileId || ring.kind !== 'alarm' || ring.ref_id !== alarmId) {
    throw new ApiError('not_found', 'That ring does not belong to this alarm.');
  }
  return ring;
}

function createAlarmRoute(
  context: PlannerContext,
  deps: PlannerClockDependencies,
): RouteOf<'createPlannerAlarm'> {
  const { store } = context;
  return bound(E.createPlannerAlarm, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const { clock } = deps.preferencesOf(profileId);
    const targets = body.targets ?? clock.targets;
    requireTargets(store, targets);
    requireScene(context, caller, body.wake_scene_id);
    return validated('alarm', () =>
      store.plannerAlarms.insert({
        profile_id: profileId,
        label: body.label,
        time: body.time,
        days: body.days,
        once_on: body.once_on,
        skip_on: null,
        enabled: body.enabled,
        sound: body.sound ?? clock.sound,
        ramp_seconds: body.ramp_seconds ?? clock.ramp_seconds,
        vibrate: body.vibrate ?? true,
        snooze_minutes: body.snooze_minutes ?? clock.snooze_minutes,
        smart_minutes: body.smart_minutes,
        wake_scene_id: body.wake_scene_id,
        wake_lead_minutes: body.wake_lead_minutes,
        targets,
        watch: [],
        source: 'planner',
      }),
    );
  });
}

function alarmRoutes(
  context: PlannerContext,
  deps: PlannerClockDependencies,
): {
  readonly updatePlannerAlarm: RouteOf<'updatePlannerAlarm'>;
  readonly deletePlannerAlarm: RouteOf<'deletePlannerAlarm'>;
  readonly skipNextPlannerAlarm: RouteOf<'skipNextPlannerAlarm'>;
} {
  const { store } = context;
  return {
    updatePlannerAlarm: bound(E.updatePlannerAlarm, ({ params, query, body, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      requireTargets(store, body.targets);
      requireScene(context, caller, body.wake_scene_id);
      return validated('alarm', () =>
        store.plannerAlarms.update(params.alarmId, profileId, alarmPatch(body)),
      );
    }),
    deletePlannerAlarm: bound(E.deletePlannerAlarm, ({ params, query, caller }) => {
      store.plannerAlarms.remove(params.alarmId, plannerProfileOf(context, caller, query.personId));
      return DONE_REPLY;
    }),
    skipNextPlannerAlarm: bound(E.skipNextPlannerAlarm, ({ params, query, caller }) =>
      deps.alarms.skipNext(plannerProfileOf(context, caller, query.personId), params.alarmId),
    ),
  };
}

function ringActionRoutes(
  context: PlannerContext,
  deps: PlannerClockDependencies,
): {
  readonly snoozePlannerAlarm: RouteOf<'snoozePlannerAlarm'>;
  readonly dismissPlannerAlarm: RouteOf<'dismissPlannerAlarm'>;
} {
  return {
    snoozePlannerAlarm: bound(E.snoozePlannerAlarm, ({ params, query, body, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      ringOf(context, profileId, params.alarmId, body.ringId);
      return deps.alarms.snooze(profileId, body.ringId, body.minutes);
    }),
    dismissPlannerAlarm: bound(E.dismissPlannerAlarm, ({ params, query, body, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      ringOf(context, profileId, params.alarmId, body.ringId);
      return deps.alarms.dismiss(profileId, body.ringId);
    }),
  };
}

export const plannerAlarmRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    createPlannerAlarm: createAlarmRoute(context, deps),
    ...alarmRoutes(context, deps),
    ...ringActionRoutes(context, deps),
  }) as const;

function startTimerRoute(
  context: PlannerContext,
  deps: PlannerClockDependencies,
): RouteOf<'startPlannerTimer'> {
  return bound(E.startPlannerTimer, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const targets = body.targets ?? deps.preferencesOf(profileId).clock.targets;
    requireTargets(context.store, targets);
    return deps.timers.begin(profileId, {
      durationMs: body.duration_ms,
      label: body.label,
      targets,
    });
  });
}

export const plannerTimerRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    startPlannerTimer: startTimerRoute(context, deps),
    pausePlannerTimer: bound(E.pausePlannerTimer, ({ params, query, caller }) =>
      deps.timers.pause(params.timerId, plannerProfileOf(context, caller, query.personId)),
    ),
    resumePlannerTimer: bound(E.resumePlannerTimer, ({ params, query, caller }) =>
      deps.timers.resume(params.timerId, plannerProfileOf(context, caller, query.personId)),
    ),
    addPlannerTimerTime: bound(E.addPlannerTimerTime, ({ params, query, body, caller }) =>
      deps.timers.addTime(
        params.timerId,
        plannerProfileOf(context, caller, query.personId),
        body.ms,
      ),
    ),
    cancelPlannerTimer: bound(E.cancelPlannerTimer, ({ params, query, caller }) =>
      deps.timers.cancelTimer(params.timerId, plannerProfileOf(context, caller, query.personId)),
    ),
  }) as const;

export const plannerStopwatchRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    startPlannerStopwatch: bound(E.startPlannerStopwatch, ({ query, caller }) =>
      context.store.write(() =>
        deps.stopwatch.begin(plannerProfileOf(context, caller, query.personId)),
      ),
    ),
    pausePlannerStopwatch: bound(E.pausePlannerStopwatch, ({ query, caller }) =>
      context.store.write(() =>
        deps.stopwatch.pause(plannerProfileOf(context, caller, query.personId)),
      ),
    ),
    lapPlannerStopwatch: bound(E.lapPlannerStopwatch, ({ query, caller }) =>
      context.store.write(() =>
        deps.stopwatch.lap(plannerProfileOf(context, caller, query.personId)),
      ),
    ),
    resetPlannerStopwatch: bound(E.resetPlannerStopwatch, ({ query, caller }) =>
      context.store.write(() =>
        deps.stopwatch.reset(plannerProfileOf(context, caller, query.personId)),
      ),
    ),
  }) as const;

function ownClient(context: PlannerContext, profileId: string, clientId: string): void {
  if (context.store.profiles.activeOf(clientId).id !== profileId) {
    throw new ApiError('forbidden', 'That phone belongs to someone else.');
  }
}

function alarmRing(
  alarm: PhoneRingSet['alarms'][number],
  dueAt: Date,
): PlannerPhoneRingSet['rings'][number] {
  return {
    ringKey: `alarm:${alarm.id}`,
    kind: 'alarm',
    refId: alarm.id,
    dueAt: dueAt.toISOString(),
    sound: alarm.sound,
    rampSeconds: alarm.rampSeconds,
    vibrate: alarm.vibrate,
    label: alarm.label,
  };
}

function ringSetOf(
  set: PhoneRingSet,
  clock: PlannerPreferences['clock'],
  now: Date,
  zone: string,
): PlannerPhoneRingSet {
  const alarms = set.alarms.flatMap((alarm) => {
    const dueAt = nextRing(
      { time: alarm.time, days: alarm.days, once_on: alarm.onceOn, skip_on: alarm.skipOn },
      now,
      zone,
    );
    return dueAt === null ? [] : [alarmRing(alarm, dueAt)];
  });
  const timers = set.timers.map((timer) => ({
    ringKey: `timer:${timer.id}`,
    kind: 'timer' as const,
    refId: timer.id,
    dueAt: timer.endsAt,
    sound: clock.sound,
    rampSeconds: 0,
    vibrate: true,
    label: timer.label,
  }));
  return { hash: set.version, rings: [...alarms, ...timers] };
}

export const plannerRingRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    listPlannerRings: bound(E.listPlannerRings, ({ query, caller }) =>
      context.store.plannerRings.between(plannerProfileOf(context, caller, query.personId), {
        from: query.from,
        to: query.to,
      }),
    ),
    readPlannerPhoneRings: bound(E.readPlannerPhoneRings, ({ query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      ownClient(context, profileId, query.clientId);
      return ringSetOf(
        deps.phoneRings.desired(query.clientId),
        deps.preferencesOf(profileId).clock,
        deps.now(),
        context.store.settings.read().time_zone,
      );
    }),
    ackPlannerPhoneRings: bound(E.ackPlannerPhoneRings, ({ query, body, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      ownClient(context, profileId, body.clientId);
      if (!deps.phoneRings.acknowledge(body.clientId, body.hash)) {
        throw new ApiError('conflict', 'The ring set changed since it was read; read it again.');
      }
      return DONE_REPLY;
    }),
  }) as const;

export const plannerClockRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    ...plannerAlarmRoutes(context, deps),
    ...plannerTimerRoutes(context, deps),
    ...plannerStopwatchRoutes(context, deps),
    ...plannerRingRoutes(context, deps),
  }) as const;
