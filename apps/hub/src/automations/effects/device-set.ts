import {
  ApiError,
  type ActionMode,
  type CommandRow,
  type DeviceTarget,
  type GroupCommandPlan,
  type JsonValue,
  type PresentedCapability,
  type SkippedGroupDevice,
  type TargetChange,
} from '@smarteverything/domain';
import { failureLine } from '@smarteverything/logging';
import type { CommandExecutor } from '../../commands/executor';
import { skippedMembersNote } from '../../device-groups/commands';
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
  readonly relative?: boolean;
  readonly snapped?: boolean;
  readonly requireAll?: boolean;
  readonly mode?: ActionMode;
  readonly at?: CommandStamp;
}

export interface DeviceSetTogetherRequest {
  readonly deviceId: string;
  readonly changes: readonly { readonly control: string; readonly value: JsonValue }[];
  readonly mode?: ActionMode;
  readonly at?: CommandStamp;
}

export interface DeviceSetResult {
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
  readonly note: string | null;
}

export interface Planned {
  readonly result: DeviceSetResult;
  readonly rows: readonly CommandRow[];
}

export function admittedMembers(
  store: Pick<Store, 'host'>,
  target: DeviceTarget,
  control: string,
): Promise<readonly Member[]> {
  return store.host.read('admittedDeviceMembers', { target, control });
}

export async function preparedPlans(
  store: Pick<Store, 'host'>,
  changes: readonly TargetChange[],
): Promise<readonly GroupCommandPlan[]> {
  return store.host.write('prepareTargetCommands', changes);
}

async function preparedPlan(
  store: Pick<Store, 'host'>,
  change: TargetChange,
): Promise<GroupCommandPlan> {
  const [plan] = await preparedPlans(store, [change]);
  if (plan === undefined) throw new ApiError('conflict', 'Preparing the command returned no plan.');
  return plan;
}

function steppedPlan(
  store: Pick<Store, 'host'>,
  members: readonly Member[],
  request: DeviceSetRequest,
): Promise<GroupCommandPlan> {
  return store.host.write('steppedDevicePlan', {
    members,
    value: request.value(),
    percent: request.percent,
    snapped: request.snapped === true,
  });
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
    readonly together?: boolean;
    readonly requireAll?: boolean;
    readonly at?: CommandStamp;
  },
): Promise<Planned> {
  const note = skippedMembersNote(ports.store.live.home, plan.skipped);
  if (plan.commands.length === 0)
    throw new ApiError('command_refused', note ?? 'No supported target commands.');
  if (options.requireAll === true && note !== null) throw new ApiError('command_refused', note);
  let rows: readonly CommandRow[];
  try {
    rows = await ports.issuer.issue(
      plan.commands.map((command) => ({
        deviceId: command.device_id,
        capability: command.capability,
        value: command.value,
      })),
      'automation',
      run,
      {
        admitted: options.admitted,
        together: options.together === true,
        ...(options.at === undefined ? {} : { at: options.at }),
      },
    );
  } catch (cause) {
    if (note === null) throw cause;
    throw new ApiError('command_refused', `${failureLine(cause)}. ${note}`);
  }
  admitRun(run);
  return {
    result: {
      sent: [...new Set(plan.commands.map((command) => command.device_id))],
      skipped: plan.skipped,
      note,
    },
    rows,
  };
}

export async function confirmed(
  ports: Pick<DeviceSetPorts, 'issuer'>,
  planned: Promise<Planned>,
  mode: ActionMode | undefined,
  run: EffectRun,
): Promise<DeviceSetResult> {
  const { result, rows } = await planned;
  await ports.issuer.confirm(rows, mode ?? 'fire_and_forget', run);
  return result;
}

export function steppedValue(
  presented: PresentedCapability,
  current: JsonValue | undefined,
  amount: JsonValue,
  percent: boolean,
): number | string {
  const descriptor = presented.capability.value;
  if (descriptor.kind !== 'number') return 'It has no number to change by an amount.';
  if (typeof current !== 'number') return 'It has not reported a value to change from yet.';
  if (typeof amount !== 'number') return 'The amount to change by is not a number.';
  const delta = percent ? (amount / 100) * (descriptor.max - descriptor.min) : amount;
  const bounded = Math.min(descriptor.max, Math.max(descriptor.min, current + delta));
  const snapped =
    descriptor.min + Math.round((bounded - descriptor.min) / descriptor.step) * descriptor.step;
  return Number(Math.min(descriptor.max, snapped).toFixed(10));
}

export function snappedValue(
  presented: PresentedCapability,
  value: JsonValue,
  percent: boolean,
): number | string {
  const descriptor = presented.capability.value;
  if (descriptor.kind !== 'number') return 'It has no number to move in steps.';
  if (typeof value !== 'number') return 'The level to move to is not a number.';
  const wanted = percent
    ? descriptor.min + (value / 100) * (descriptor.max - descriptor.min)
    : value;
  const bounded = Math.min(descriptor.max, Math.max(descriptor.min, wanted));
  const snapped =
    descriptor.min + Math.round((bounded - descriptor.min) / descriptor.step) * descriptor.step;
  return Number(Math.min(descriptor.max, snapped).toFixed(10));
}

export class DeviceSetter {
  constructor(private readonly ports: DeviceSetPorts) {}

  async set(request: DeviceSetRequest, run: EffectRun): Promise<DeviceSetResult> {
    if (request.relative === true) return this.setRelative(request, run);
    const { store, executor } = this.ports;
    const { target, control, percent } = request;
    const change = (): TargetChange => ({
      target,
      capability: control,
      value: request.value(),
      ...(percent ? { scale: 'percent' as const } : {}),
    });
    const plan = async (members?: readonly Member[]): Promise<GroupCommandPlan> => {
      if (request.snapped === true)
        return steppedPlan(
          store,
          members ?? (await admittedMembers(store, target, control)),
          request,
        );
      const planned = await preparedPlan(store, change());
      return members === undefined ? planned : restrictedTo(planned, members);
    };
    const options = {
      requireAll: request.requireAll === true,
      ...(request.at === undefined ? {} : { at: request.at }),
    };
    if (!request.serialised)
      return confirmed(
        this.ports,
        plan().then((planned) =>
          submitPlan(this.ports, planned, run, { ...options, admitted: false }),
        ),
        request.mode,
        run,
      );
    const members = await admittedMembers(store, target, control);
    return confirmed(
      this.ports,
      admitMembers(executor, members, run, async () =>
        submitPlan(this.ports, await plan(members), run, { ...options, admitted: true }),
      ),
      request.mode,
      run,
    );
  }

  private async setRelative(request: DeviceSetRequest, run: EffectRun): Promise<DeviceSetResult> {
    const { store, executor } = this.ports;
    const members = await admittedMembers(store, request.target, request.control);
    return confirmed(
      this.ports,
      admitMembers(executor, members, run, async () =>
        submitPlan(this.ports, await steppedPlan(store, members, request), run, {
          admitted: true,
          requireAll: request.requireAll === true,
          ...(request.at === undefined ? {} : { at: request.at }),
        }),
      ),
      request.mode,
      run,
    );
  }

  async setTogether(request: DeviceSetTogetherRequest, run: EffectRun): Promise<DeviceSetResult> {
    const { store, executor } = this.ports;
    const target: DeviceTarget = { kind: 'devices', deviceIds: [request.deviceId] };
    const admitted = await Promise.all(
      request.changes.map(({ control }) => admittedMembers(store, target, control)),
    );
    const members = [
      ...new Map(admitted.flat().map((member) => [JSON.stringify(member), member])).values(),
    ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const planned = admitMembers(executor, members, run, async () => {
      const prepared = await preparedPlans(
        store,
        request.changes.map(({ control, value }) => ({ target, capability: control, value })),
      );
      const plans = request.changes.map(({ control }, index) => {
        const plan = prepared[index];
        if (plan === undefined)
          throw new ApiError('conflict', 'Preparing the commands returned too few plans.');
        return { control, plan };
      });
      const plan = restrictedTo(
        {
          commands: plans.flatMap(({ plan: planned }) => planned.commands),
          skipped: plans.flatMap(({ control, plan: planned }) =>
            planned.skipped.map((skip) => ({
              ...skip,
              detail: `${control}: ${skip.detail ?? skip.reason}`,
            })),
          ),
        },
        members,
      );
      return submitPlan(this.ports, plan, run, {
        admitted: true,
        together: true,
        ...(request.at === undefined ? {} : { at: request.at }),
      });
    });
    return confirmed(this.ports, planned, request.mode, run);
  }
}
