import {
  ApiError,
  targetCapability,
  type DeviceTarget,
  type GroupCommandPlan,
  type JsonValue,
  type SkippedGroupDevice,
  type TargetChange,
} from '@smarteverything/domain';
import { failureLine } from '@smarteverything/logging';
import type { CommandExecutor } from '../../commands/executor';
import {
  prepareTargetCommands,
  resolveTarget,
  skippedMembersNote,
} from '../../device-groups/commands';
import type { Store } from '../../store/store';
import type { CommandIssuer } from '../issue-commands';
import { admitRun, awaitRun } from './run-abort';
import type { CommandStamp } from './command-metadata';
import type { EffectRun } from './effect-run';

export interface Member {
  readonly deviceId: string;
  readonly capability: string;
}

export interface DeviceSetPorts {
  readonly store: Store;
  readonly executor: CommandExecutor;
  readonly issuer: CommandIssuer;
}

export interface DeviceSetRequest {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly value: () => JsonValue;
  readonly percent: boolean;
  readonly serialised: boolean;
  readonly requireAll?: boolean;
  readonly at?: CommandStamp;
}

export interface DeviceSetResult {
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
  readonly note: string | null;
}

export function admittedMembers(
  store: Store,
  target: DeviceTarget,
  control: string,
): readonly Member[] {
  const members = resolveTarget(store, target).flatMap((device) => {
    const presented = targetCapability(device, control);
    return presented?.writable === true ? [{ deviceId: device.id, capability: presented.key }] : [];
  });
  return [...new Map(members.map((member) => [JSON.stringify(member), member])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, member]) => member);
}

export function admitMembers<T>(
  executor: CommandExecutor,
  members: readonly Member[],
  run: EffectRun,
  work: () => Promise<T>,
): Promise<T> {
  admitRun(run);
  const [member, ...remaining] = members;
  if (member === undefined) return work();
  return awaitRun(
    executor.admit(member.deviceId, member.capability, () =>
      admitMembers(executor, remaining, run, work),
    ),
    run,
  );
}

export function restrictedTo(plan: GroupCommandPlan, members: readonly Member[]): GroupCommandPlan {
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

export async function submitPlan(
  ports: Pick<DeviceSetPorts, 'store' | 'issuer'>,
  plan: GroupCommandPlan,
  run: EffectRun,
  options: {
    readonly admitted: boolean;
    readonly requireAll?: boolean;
    readonly at?: CommandStamp;
  },
): Promise<DeviceSetResult> {
  const note = skippedMembersNote(ports.store, plan.skipped);
  if (plan.commands.length === 0)
    throw new ApiError('command_refused', note ?? 'No supported target commands.');
  if (options.requireAll === true && note !== null) throw new ApiError('command_refused', note);
  try {
    await ports.issuer.issue(
      plan.commands.map((command) => ({
        deviceId: command.device_id,
        capability: command.capability,
        value: command.value,
      })),
      'automation',
      run,
      { admitted: options.admitted, ...(options.at === undefined ? {} : { at: options.at }) },
    );
  } catch (cause) {
    if (note === null) throw cause;
    throw new ApiError('command_refused', `${failureLine(cause)}. ${note}`);
  }
  admitRun(run);
  return {
    sent: [...new Set(plan.commands.map((command) => command.device_id))],
    skipped: plan.skipped,
    note,
  };
}

export class DeviceSetter {
  constructor(private readonly ports: DeviceSetPorts) {}

  async set(request: DeviceSetRequest, run: EffectRun): Promise<DeviceSetResult> {
    const { store, executor } = this.ports;
    const { target, control, percent } = request;
    const change = (): TargetChange => ({
      target,
      capability: control,
      value: request.value(),
      ...(percent ? { scale: 'percent' as const } : {}),
    });
    const plan = (members?: readonly Member[]): GroupCommandPlan => {
      const planned = store.write(() => prepareTargetCommands(store, change(), null));
      return members === undefined ? planned : restrictedTo(planned, members);
    };
    const options = {
      requireAll: request.requireAll === true,
      ...(request.at === undefined ? {} : { at: request.at }),
    };
    if (!request.serialised)
      return await submitPlan(this.ports, plan(), run, { ...options, admitted: false });
    const members = admittedMembers(store, target, control);
    return admitMembers(executor, members, run, () =>
      submitPlan(this.ports, plan(members), run, { ...options, admitted: true }),
    );
  }
}
