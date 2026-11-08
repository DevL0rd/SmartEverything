import { ApiError, type ActionMode, type SkippedGroupDevice } from '@smarteverything/domain';
import { failureLine } from '@smarteverything/logging';
import type { Snapshot } from '../world-v3/snapshot';
import type { CommandStamp } from './command-metadata';
import type { DeviceSetTogetherRequest, DeviceSetter } from './device-set';
import type { EffectRun } from './effect-run';

export interface DeviceRestoreResult {
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
}

interface Restored {
  readonly deviceId: string;
  readonly sent: boolean;
  readonly skipped: readonly SkippedGroupDevice[];
}

const LAST_CONTROL = 'power';

function inRestoreOrder(controls: readonly string[]): readonly string[] {
  return [
    ...controls.filter((control) => control !== LAST_CONTROL),
    ...controls.filter((control) => control === LAST_CONTROL),
  ];
}

function plannedRestores(
  snapshot: Snapshot,
  at: CommandStamp,
): readonly DeviceSetTogetherRequest[] {
  let iteration = at.iteration;
  return Object.entries(snapshot).map(([deviceId, values]) => {
    const changes = inRestoreOrder(Object.keys(values)).flatMap((control) => {
      const value = values[control];
      return value === undefined ? [] : [{ control, value }];
    });
    const planned = { deviceId, changes, at: { ...at, iteration } };
    iteration += changes.length;
    return planned;
  });
}

export class DeviceRestorer {
  constructor(private readonly setter: Pick<DeviceSetter, 'setTogether'>) {}

  async restore(
    snapshot: Snapshot,
    at: CommandStamp,
    run: EffectRun,
    mode?: ActionMode,
  ): Promise<DeviceRestoreResult> {
    const restored = await Promise.all(
      plannedRestores(snapshot, at).map((request) =>
        this.restoreOne(mode === undefined ? request : { ...request, mode }, run),
      ),
    );
    const sent = new Set(restored.flatMap((device) => (device.sent ? [device.deviceId] : [])));
    const skipped = restored.flatMap((device) => device.skipped);
    if (sent.size === 0) {
      throw new ApiError('command_refused', 'None of the remembered devices could be restored.');
    }
    return { sent: [...sent], skipped };
  }

  private async restoreOne(request: DeviceSetTogetherRequest, run: EffectRun): Promise<Restored> {
    const { deviceId } = request;
    try {
      const result = await this.setter.setTogether(request, run);
      return { deviceId, sent: true, skipped: result.skipped };
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.code !== 'command_refused') throw cause;
      return {
        deviceId,
        sent: false,
        skipped: [{ deviceId, reason: 'unsupported', detail: failureLine(cause) }],
      };
    }
  }
}
