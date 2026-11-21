import {
  API_ENDPOINTS as E,
  ApiError,
  type PlannerAlarmSound,
  type PlannerPreferences,
  type PlannerRingRow,
} from '@smarteverything/domain';
import type { AlarmSoundCheck } from '../../planner/alarm-sound-check';
import type { AlarmScheduler } from '../../planner/alarms';
import type { PhoneRings } from '../../planner/phone-rings';
import type { RadioDirectory } from '../../planner/radio';
import type { StopwatchService } from '../../planner/stopwatch';
import type { TimerService } from '../../planner/timers';
import type { Caller } from '../auth';
import { refusal } from '../person-access';
import { subjectOf } from '../person-scope';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileFor, type PlannerContext } from './planner-profile';
import type { Checked } from './planner-shared-units';

async function requireSound(
  sounds: Pick<AlarmSoundCheck, 'assertUsable'>,
  profileId: string,
  sound: PlannerAlarmSound | undefined,
): Promise<void> {
  if (sound !== undefined) await sounds.assertUsable(profileId, sound);
}

export interface PlannerClockDependencies {
  readonly preferencesOf: (profileId: string) => Promise<PlannerPreferences>;
  readonly alarms: Pick<AlarmScheduler, 'skipNext' | 'snooze' | 'dismiss'>;
  readonly timers: Pick<TimerService, 'begin' | 'pause' | 'resume' | 'addTime' | 'cancelTimer'>;
  readonly stopwatch: Pick<StopwatchService, 'begin' | 'pause' | 'lap' | 'reset'>;
  readonly phoneRings: Pick<PhoneRings, 'read' | 'acknowledge'>;
  readonly sounds: Pick<AlarmSoundCheck, 'assertUsable'>;
  readonly radio: Pick<RadioDirectory, 'search'>;
}

function checked<T>(context: PlannerContext, caller: Caller, outcome: Checked<T>): T {
  if (outcome.kind === 'refused') throw refusal(context.store, subjectOf(caller), outcome.why);
  return outcome.value;
}

async function ringOf(
  context: PlannerContext,
  profileId: string,
  alarmId: string,
  ringId: string,
): Promise<PlannerRingRow> {
  const ring = await context.store.host.call('plannerRings', 'find', ringId);
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
  return bound(E.createPlannerAlarm, async ({ query, body, caller, params }) => {
    const profileId = await plannerProfileFor(context, caller, query.personId);
    await requireSound(deps.sounds, profileId, body.sound);
    const { clock } = await deps.preferencesOf(profileId);
    const outcome = await store.host.write('plannerAlarmCreate', {
      caller,
      query,
      body,
      params,
      clock,
    });
    return checked(context, caller, outcome);
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
    updatePlannerAlarm: bound(E.updatePlannerAlarm, async ({ params, query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await requireSound(deps.sounds, profileId, body.sound);
      const outcome = await store.host.write('plannerAlarmUpdate', { caller, query, body, params });
      return checked(context, caller, outcome);
    }),
    deletePlannerAlarm: bound(E.deletePlannerAlarm, async ({ params, query, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await store.host.call('plannerAlarms', 'remove', params.alarmId, profileId);
      return DONE_REPLY;
    }),
    skipNextPlannerAlarm: bound(E.skipNextPlannerAlarm, async ({ params, query, caller }) =>
      deps.alarms.skipNext(
        await plannerProfileFor(context, caller, query.personId),
        params.alarmId,
      ),
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
    snoozePlannerAlarm: bound(E.snoozePlannerAlarm, async ({ params, query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await ringOf(context, profileId, params.alarmId, body.ringId);
      return deps.alarms.snooze(profileId, body.ringId, body.minutes);
    }),
    dismissPlannerAlarm: bound(E.dismissPlannerAlarm, async ({ params, query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await ringOf(context, profileId, params.alarmId, body.ringId);
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
  return bound(E.startPlannerTimer, async ({ query, body, caller }) => {
    const profileId = await plannerProfileFor(context, caller, query.personId);
    const targets = body.targets ?? (await deps.preferencesOf(profileId)).clock.targets;
    await context.store.host.read('plannerTargetsCheck', { targets });
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
    pausePlannerTimer: bound(E.pausePlannerTimer, async ({ params, query, caller }) =>
      deps.timers.pause(params.timerId, await plannerProfileFor(context, caller, query.personId)),
    ),
    resumePlannerTimer: bound(E.resumePlannerTimer, async ({ params, query, caller }) =>
      deps.timers.resume(params.timerId, await plannerProfileFor(context, caller, query.personId)),
    ),
    addPlannerTimerTime: bound(E.addPlannerTimerTime, async ({ params, query, body, caller }) =>
      deps.timers.addTime(
        params.timerId,
        await plannerProfileFor(context, caller, query.personId),
        body.ms,
      ),
    ),
    cancelPlannerTimer: bound(E.cancelPlannerTimer, async ({ params, query, caller }) =>
      deps.timers.cancelTimer(
        params.timerId,
        await plannerProfileFor(context, caller, query.personId),
      ),
    ),
  }) as const;

export const plannerStopwatchRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    startPlannerStopwatch: bound(E.startPlannerStopwatch, async ({ query, caller }) =>
      deps.stopwatch.begin(await plannerProfileFor(context, caller, query.personId)),
    ),
    pausePlannerStopwatch: bound(E.pausePlannerStopwatch, async ({ query, caller }) =>
      deps.stopwatch.pause(await plannerProfileFor(context, caller, query.personId)),
    ),
    lapPlannerStopwatch: bound(E.lapPlannerStopwatch, async ({ query, caller }) =>
      deps.stopwatch.lap(await plannerProfileFor(context, caller, query.personId)),
    ),
    resetPlannerStopwatch: bound(E.resetPlannerStopwatch, async ({ query, caller }) =>
      deps.stopwatch.reset(await plannerProfileFor(context, caller, query.personId)),
    ),
  }) as const;

async function ownClient(
  context: PlannerContext,
  profileId: string,
  clientId: string,
): Promise<void> {
  if ((await context.store.host.call('profiles', 'activeOf', clientId)).id !== profileId) {
    throw new ApiError('forbidden', 'That phone belongs to someone else.');
  }
}

export const plannerRingRoutes = (context: PlannerContext, deps: PlannerClockDependencies) =>
  ({
    listPlannerRings: bound(E.listPlannerRings, async ({ query, caller }) =>
      context.store.host.call(
        'plannerRings',
        'between',
        await plannerProfileFor(context, caller, query.personId),
        { from: query.from, to: query.to },
      ),
    ),
    readPlannerPhoneRings: bound(E.readPlannerPhoneRings, async ({ query, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await ownClient(context, profileId, query.clientId);
      return deps.phoneRings.read(query.clientId, profileId);
    }),
    searchPlannerRadio: bound(E.searchPlannerRadio, async ({ query }) =>
      deps.radio.search(query.text),
    ),
    ackPlannerPhoneRings: bound(E.ackPlannerPhoneRings, async ({ query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      await ownClient(context, profileId, body.clientId);
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
