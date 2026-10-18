import {
  ApiError,
  deviceTargetOf,
  readsLive,
  targetCapability,
  type DeviceEffectOperation,
  type DeviceTarget,
  type GroupCommandPlan,
  type StepV2,
  type TargetChange,
} from '@smarteverything/domain';
import { type CommandExecutor } from '../commands/executor';
import {
  prepareTargetCommands,
  resolveTarget,
  skippedMembersNote,
} from '../device-groups/commands';
import type { Store } from '../store/store';
import type { CommandIssuer } from './issue-commands';
import { admitRun, awaitRun, type RunContext } from './run-context';
import type { TemporaryChanges } from './temporary-effect';
import type { AutomationWorld } from './world';
import { failureLine } from '@smarteverything/logging';

export type SetStepV2 = Extract<StepV2, { do: 'set' }>;

interface Member {
  readonly deviceId: string;
  readonly capability: string;
}

export function nodeIdOf(step: { readonly id?: string | undefined }): string {
  if (step.id === undefined)
    throw new ApiError('conflict', 'A step has no identity. Save the automation again.');
  return step.id;
}

function admittedMembers(store: Store, target: DeviceTarget, control: string): readonly Member[] {
  const members = resolveTarget(store, target).flatMap((device) => {
    const presented = targetCapability(device, control);
    return presented?.writable === true ? [{ deviceId: device.id, capability: presented.key }] : [];
  });
  return [...new Map(members.map((member) => [JSON.stringify(member), member])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, member]) => member);
}

function admitMembers<T>(
  executor: CommandExecutor,
  members: readonly Member[],
  context: RunContext,
  work: () => Promise<T>,
): Promise<T> {
  admitRun(context);
  const [member, ...remaining] = members;
  if (member === undefined) return work();
  return awaitRun(
    executor.admit(member.deviceId, member.capability, () =>
      admitMembers(executor, remaining, context, work),
    ),
    context,
  );
}

function restrictedTo(plan: GroupCommandPlan, members: readonly Member[]): GroupCommandPlan {
  const known = new Set(members.map((member) => `${member.deviceId}|${member.capability}`));
  const kept = plan.commands.filter((command) =>
    known.has(`${command.device_id}|${command.capability}`),
  );
  const moved = plan.commands.filter((command) => !kept.includes(command));
  return {
    commands: kept,
    skipped: [
      ...plan.skipped,
      ...moved.map((command) => ({
        deviceId: command.device_id,
        reason: 'unsupported' as const,
        detail: 'It joined the target while the step was starting.',
      })),
    ],
  };
}

interface SetStepOptions {
  readonly store: Store;
  readonly executor: CommandExecutor;
  readonly world: AutomationWorld;
  readonly issuer: CommandIssuer;
  readonly changes: TemporaryChanges;
}

export class SetSteps {
  constructor(private readonly options: SetStepOptions) {}

  run(step: SetStepV2, context: RunContext): Promise<string | null> {
    return step.for === undefined ? this.immediate(step, context) : this.temporary(step, context);
  }

  private async immediate(step: SetStepV2, context: RunContext): Promise<string | null> {
    const { store, executor, world } = this.options;
    const { to } = step;
    if (to === undefined) throw new ApiError('invalid_request', 'A set step needs a value.');
    const target = deviceTargetOf(step.target);
    const change = (): TargetChange => ({
      target,
      capability: step.control,
      value: world.resolve(to, context.inputs, 'label'),
      ...(step.percent === true ? { scale: 'percent' as const } : {}),
    });
    const plan = (members?: readonly Member[]): GroupCommandPlan => {
      const planned = store.write(() => prepareTargetCommands(store, change(), null));
      return members === undefined ? planned : restrictedTo(planned, members);
    };
    if (!readsLive(to)) return this.submit(plan(), context, false);
    const members = admittedMembers(store, target, step.control);
    return admitMembers(executor, members, context, () =>
      this.submit(plan(members), context, true),
    );
  }

  private async submit(
    plan: GroupCommandPlan,
    context: RunContext,
    admitted: boolean,
  ): Promise<string | null> {
    const note = skippedMembersNote(this.options.store, plan.skipped);
    if (plan.commands.length === 0)
      throw new ApiError('command_refused', note ?? 'No supported target commands.');
    try {
      await this.options.issuer.issue(
        plan.commands.map((command) => ({
          deviceId: command.device_id,
          capability: command.capability,
          value: command.value,
        })),
        'automation',
        context,
        admitted,
      );
    } catch (cause) {
      if (note === null) throw cause;
      throw new ApiError('command_refused', `${failureLine(cause)}. ${note}`);
    }
    admitRun(context);
    return note;
  }

  private temporary(step: SetStepV2, context: RunContext): Promise<string | null> {
    const { for: durationMs } = step;
    if (durationMs === undefined) throw new ApiError('invalid_request', 'A change needs a time.');
    return this.options.changes.run(
      {
        target: deviceTargetOf(step.target),
        control: step.control,
        operation: this.operation(step, context),
        durationMs,
        priority: step.priority ?? 0,
        whileHolds: step.while,
        nodeId: nodeIdOf(step),
      },
      context,
    );
  }

  private operation(step: SetStepV2, context: RunContext): DeviceEffectOperation {
    if (step.to !== undefined)
      return {
        type: 'set',
        value: this.options.world.resolve(step.to, context.inputs, 'label'),
      };
    if (step.by === undefined)
      throw new ApiError('invalid_request', 'A set step needs a value or an amount.');
    return { type: 'add', value: step.by };
  }
}
