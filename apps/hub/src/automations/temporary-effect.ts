import {
  ApiError,
  conditionClockMinutes,
  deviceEffectSupport,
  localClock,
  shiftedDate,
  targetCapability,
  validateDeviceEffect,
  zonedInstant,
  type ConditionV2,
  type DeviceEffectOperation,
  type DeviceTarget,
  type GroupCommandPlan,
  type SkippedGroupDevice,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { DeviceEffects } from '../commands/effects';
import { resolveTarget, skippedMembersNote } from '../device-groups/commands';
import type { Store } from '../store/store';
import { admitRun, AutomationRunCancelledError, type RunContext } from './run-context';
import type { AutomationWorld } from './world';
import { messageOf } from '@smarteverything/logging';

interface TemporaryChange {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly operation: DeviceEffectOperation;
  readonly durationMs: number;
  readonly priority: number;
  readonly whileHolds: ConditionV2 | undefined;
  readonly nodeId: string;
}

interface Member {
  readonly id: string;
  readonly capability: string;
}

interface Lifetime {
  readonly change: TemporaryChange;
  readonly context: RunContext;
  readonly ids: readonly string[];
  readonly expires: number;
  readonly holds: () => boolean;
}

const WATCHED_TABLES: ReadonlySet<string> = new Set([
  'device_state',
  'device_effect_targets',
  'automation_values',
  'weather',
  'settings',
]);

export function effectMembers(
  store: Store,
  change: Pick<TemporaryChange, 'target' | 'control' | 'operation'>,
): { readonly members: readonly Member[]; readonly skipped: GroupCommandPlan['skipped'] } {
  const members: Member[] = [];
  const skipped: SkippedGroupDevice[] = [];
  for (const device of resolveTarget(store, change.target)) {
    const presented = targetCapability(device, change.control);
    try {
      if (presented === undefined)
        throw new ApiError('command_refused', 'This control is unsupported.');
      const reason = deviceEffectSupport(presented.capability);
      if (reason !== null) throw new ApiError('command_refused', reason);
      validateDeviceEffect(presented.capability.value, change.operation);
      members.push({ id: device.id, capability: presented.key });
    } catch (cause) {
      skipped.push({ deviceId: device.id, reason: 'unsupported', detail: messageOf(cause) });
    }
  }
  return { members, skipped };
}

export class TemporaryChanges {
  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
    private readonly effects: DeviceEffects,
    private readonly world: AutomationWorld,
  ) {}

  async run(change: TemporaryChange, context: RunContext): Promise<string | null> {
    const holds = (): boolean =>
      change.whileHolds === undefined || this.world.holds(change.whileHolds, context.inputs);
    admitRun(context);
    if (!holds()) return 'The temporary condition is false.';
    const { members, skipped } = this.requiredMembers(change);
    const expires = this.clock.now().getTime() + change.durationMs;
    const ids: string[] = [];
    let failure: unknown;
    try {
      for (const member of members) ids.push(await this.start(member, change, context, expires));
      await this.wait({ change, context, ids, expires, holds });
    } catch (cause) {
      failure = cause;
    }
    try {
      await this.release(ids, context);
    } catch (cause) {
      failure ??= cause;
    }
    if (failure !== undefined)
      throw failure instanceof Error
        ? failure
        : new ApiError('upstream_failed', 'The temporary change could not finish.');
    return skippedMembersNote(this.store, skipped);
  }

  private requiredMembers(change: TemporaryChange): ReturnType<typeof effectMembers> {
    const plan = effectMembers(this.store, change);
    if (plan.members.length === 0)
      throw new ApiError(
        'command_refused',
        skippedMembersNote(this.store, plan.skipped) ?? 'This target has no supported controls.',
      );
    return plan;
  }

  private start(
    member: Member,
    change: TemporaryChange,
    context: RunContext,
    expires: number,
  ): Promise<string> {
    return this.effects.activate(member.id, member.capability, {
      effect: {
        runId: context.runId,
        nodeId: change.nodeId,
        operation: change.operation,
        priority: change.priority,
        expiresAt: new Date(expires).toISOString(),
      },
      authorize: (): void => {
        admitRun(context);
      },
      record: context.commands,
    });
  }

  private async release(ids: readonly string[], context: RunContext): Promise<void> {
    const results = await Promise.allSettled(
      ids.map((id) =>
        this.effects.end(
          id,
          () => {
            admitRun(context);
          },
          context.commands,
        ),
      ),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  private nextBoundary(whileHolds: ConditionV2 | undefined, deadline: number): number {
    if (whileHolds === undefined) return deadline;
    const now = this.clock.now();
    const zone = this.store.settings.read().time_zone;
    const local = localClock(now, zone);
    const times = [0, 1]
      .flatMap((day) =>
        conditionClockMinutes(whileHolds).map((minute) =>
          zonedInstant(shiftedDate(local, day), minute, zone).getTime(),
        ),
      )
      .filter((time) => time > now.getTime());
    return Math.min(deadline, ...times);
  }

  private wait(lifetime: Lifetime): Promise<void> {
    return new Promise((resolve, reject) => {
      let cancelTimer = (): void => undefined;
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
          if (this.finished(lifetime)) {
            finish();
            return;
          }
          cancelTimer = this.clock.at(
            new Date(this.nextBoundary(lifetime.change.whileHolds, lifetime.expires)),
            evaluate,
          );
        } catch (cause) {
          finish(cause);
        }
      };
      lifetime.context.signal.addEventListener('abort', abort, { once: true });
      const stopFeed = this.store.feed.subscribe((change) => {
        if (WATCHED_TABLES.has(change.table)) evaluate();
      });
      evaluate();
    });
  }

  private finished(lifetime: Lifetime): boolean {
    const active = this.store.deviceEffects
      .list()
      .flatMap((target) => target.effects.map((effect) => effect.id));
    return (
      this.clock.now().getTime() >= lifetime.expires ||
      !lifetime.holds() ||
      lifetime.ids.every((id) => !active.includes(id))
    );
  }
}
