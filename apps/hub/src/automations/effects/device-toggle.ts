import {
  ApiError,
  type ActionMode,
  type DeviceTarget,
  type GroupCommandPlan,
} from '@smarteverything/domain';
import { prepareTargetCommands } from '../../device-groups/commands';
import {
  admitMembers,
  admittedMembers,
  confirmed,
  restrictedTo,
  submitPlan,
  type DeviceSetPorts,
  type DeviceSetResult,
} from './device-set';
import type { CommandStamp } from './command-metadata';
import type { EffectRun } from './effect-run';

export interface DeviceToggleRequest {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly mode?: ActionMode;
  readonly at?: CommandStamp;
}

export interface DeviceToggleResult extends DeviceSetResult {
  readonly values: readonly { readonly deviceId: string; readonly value: boolean }[];
}

export class DeviceToggler {
  constructor(
    private readonly ports: DeviceSetPorts,
    private readonly read: (deviceId: string, capability: string) => unknown,
  ) {}

  async toggle(request: DeviceToggleRequest, run: EffectRun): Promise<DeviceToggleResult> {
    const { store, executor } = this.ports;
    const members = admittedMembers(store, request.target, request.control);
    const flipped = admitMembers(executor, members, run, async () => {
      const flips = members.map((member) => ({ member, value: this.flipped(member) }));
      const plans = flips.map(({ member, value }) =>
        store.write(() =>
          prepareTargetCommands(
            store,
            {
              target: { kind: 'devices', deviceIds: [member.deviceId] },
              capability: member.capability,
              value,
            },
            null,
          ),
        ),
      );
      const plan: GroupCommandPlan = restrictedTo(
        {
          commands: plans.flatMap((planned) => planned.commands),
          skipped: plans.flatMap((planned) => planned.skipped),
        },
        members,
      );
      const planned = await submitPlan(this.ports, plan, run, {
        admitted: true,
        ...(request.at === undefined ? {} : { at: request.at }),
      });
      return {
        planned,
        values: flips.map(({ member, value }) => ({ deviceId: member.deviceId, value })),
      };
    });
    const { planned, values } = await flipped;
    const result = await confirmed(this.ports, Promise.resolve(planned), request.mode, run);
    return { ...result, values };
  }

  private flipped(member: { readonly deviceId: string; readonly capability: string }): boolean {
    const current = this.read(member.deviceId, member.capability);
    if (typeof current !== 'boolean')
      throw new ApiError('command_refused', `${member.capability} is not an on or off control.`);
    return !current;
  }
}
