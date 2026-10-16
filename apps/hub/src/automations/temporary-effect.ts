import {
  ApiError,
  deviceEffectSupport,
  targetCapability,
  validateDeviceEffect,
  type TemporaryEffectAction,
  type Conditions,
  localClock,
  minuteOfClock,
  shiftedDate,
  zonedInstant,
} from '@smarteverything/domain';
import type { DeviceEffects } from '../commands/effects';
import type { Clock } from '../clock';
import { resolveTarget } from '../device-groups/commands';
import type { Store } from '../store/store';
import { admitRun, AutomationRunCancelledError, type ActionExecutionContext } from './run-context';
import type { StructuredActionServices } from './structured-actions';

export function effectMembers(
  store: Store,
  action: TemporaryEffectAction,
): {
  readonly members: readonly { readonly id: string; readonly capability: string }[];
  readonly skipped: readonly string[];
} {
  const members: { readonly id: string; readonly capability: string }[] = [];
  const skipped: string[] = [];
  for (const device of resolveTarget(store, action.target)) {
    const presented = targetCapability(device, action.capability);
    try {
      if (presented === undefined)
        throw new ApiError('command_refused', 'This control is unsupported.');
      const reason = deviceEffectSupport(presented.capability);
      if (reason !== null) throw new ApiError('command_refused', reason);
      validateDeviceEffect(presented.capability.value, action.operation);
      members.push({ id: device.id, capability: presented.key });
    } catch (cause) {
      skipped.push(`${device.id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return { members, skipped };
}
function nextBoundary(
  conditions: Conditions,
  store: Store,
  clock: Clock,
  deadline: number,
): number {
  const now = clock.now();
  const zone = store.settings.read().time_zone;
  const local = localClock(now, zone);
  const minutes = conditions.items.flatMap((condition) => {
    if (condition.type === 'weekday') return [0];
    if (condition.type === 'time_window')
      return [minuteOfClock(condition.after), minuteOfClock(condition.before)];
    return [];
  });
  const times = [0, 1]
    .flatMap((day) =>
      minutes.map((minute) => zonedInstant(shiftedDate(local, day), minute, zone).getTime()),
    )
    .filter((time) => time > now.getTime());
  return Math.min(deadline, ...times);
}
interface Lifetime {
  readonly action: TemporaryEffectAction;
  readonly context: ActionExecutionContext;
  readonly ids: readonly string[];
  readonly expires: number;
  readonly holds: () => boolean;
}
function waitEffect(store: Store, clock: Clock, lifetime: Lifetime): Promise<void> {
  return new Promise((resolve, reject) => {
    let cancelTimer = (): void => undefined;
    let stopFeed = (): void => undefined;
    const finish = (cause?: unknown): void => {
      cancelTimer();
      stopFeed();
      lifetime.context.signal.removeEventListener('abort', abort);
      if (cause === undefined) resolve();
      else
        reject(
          cause instanceof Error
            ? cause
            : new ApiError('upstream_failed', 'The temporary change could not finish.'),
        );
    };
    const abort = (): void => {
      finish(new AutomationRunCancelledError(lifetime.context.runId));
    };
    const evaluate = (): void => {
      cancelTimer();
      try {
        admitRun(lifetime.context);
        const active = store.deviceEffects
          .list()
          .flatMap((target) => target.effects.map((effect) => effect.id));
        if (
          clock.now().getTime() >= lifetime.expires ||
          !lifetime.holds() ||
          lifetime.ids.every((id) => !active.includes(id))
        ) {
          finish();
          return;
        }
        const next =
          lifetime.action.while === undefined
            ? lifetime.expires
            : nextBoundary(lifetime.action.while, store, clock, lifetime.expires);
        cancelTimer = clock.at(new Date(next), evaluate);
      } catch (cause) {
        finish(cause);
      }
    };
    lifetime.context.signal.addEventListener('abort', abort, { once: true });
    stopFeed = store.feed.subscribeCommitted(evaluate);
    evaluate();
  });
}
function startMember(
  effects: DeviceEffects,
  request: {
    readonly member: { readonly id: string; readonly capability: string };
    readonly action: TemporaryEffectAction;
    readonly context: ActionExecutionContext;
    readonly expires: number;
  },
): Promise<string> {
  const { member, action, context, expires } = request;
  return effects.activate(member.id, member.capability, {
    effect: {
      runId: context.runId,
      nodeId: action.nodeId,
      operation: action.operation,
      priority: action.priority,
      expiresAt: new Date(expires).toISOString(),
    },
    authorize: (): void => {
      admitRun(context);
    },
    record: context.commands,
  });
}
async function releaseEffects(
  effects: DeviceEffects,
  ids: readonly string[],
  context: ActionExecutionContext,
): Promise<void> {
  const results = await Promise.allSettled(
    ids.map((id) => effects.end(id, context.authorize, context.commands)),
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
function requireEffectMembers(
  store: Store,
  action: TemporaryEffectAction,
): ReturnType<typeof effectMembers> {
  const plan = effectMembers(store, action);
  if (plan.members.length === 0)
    throw new ApiError(
      'command_refused',
      plan.skipped.length > 0 ? plan.skipped.join('; ') : 'This target has no supported controls.',
    );
  return plan;
}
export function temporaryEffectService(
  store: Store,
  clock: Clock,
  effects: DeviceEffects,
  conditions: StructuredActionServices['conditions'],
): NonNullable<StructuredActionServices['temporaryEffect']> {
  return async (action, context, parameters): Promise<string | null> => {
    const holds = (): boolean => action.while === undefined || conditions(action.while, parameters);
    admitRun(context);
    if (!holds()) return 'The temporary condition is false.';
    const { members, skipped } = requireEffectMembers(store, action);
    const expires = clock.now().getTime() + action.durationMs;
    const ids: string[] = [];
    let failure: unknown;
    try {
      for (const member of members)
        ids.push(await startMember(effects, { member, action, context, expires }));
      await waitEffect(store, clock, { action, context, ids, expires, holds });
    } catch (cause) {
      failure = cause;
    }
    try {
      await releaseEffects(effects, ids, context);
    } catch (cause) {
      if (failure === undefined) failure = cause;
    }
    if (failure !== undefined)
      throw failure instanceof Error
        ? failure
        : new ApiError('upstream_failed', 'The temporary change could not finish.');
    return skipped.length === 0 ? null : `Skipped members: ${skipped.join('; ')}`;
  };
}
