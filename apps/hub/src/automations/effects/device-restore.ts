import { ApiError, type SkippedGroupDevice } from '@smarteverything/domain';
import { failureLine } from '@smarteverything/logging';
import type { Snapshot } from '../world-v3/snapshot';
import type { CommandStamp } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectRun } from './effect-run';

export interface DeviceRestoreResult {
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
}

const LAST_CONTROL = 'power';

function inRestoreOrder(controls: readonly string[]): readonly string[] {
  return [
    ...controls.filter((control) => control !== LAST_CONTROL),
    ...controls.filter((control) => control === LAST_CONTROL),
  ];
}

export class DeviceRestorer {
  constructor(private readonly setter: Pick<DeviceSetter, 'set'>) {}

  async restore(
    snapshot: Snapshot,
    at: CommandStamp,
    run: EffectRun,
  ): Promise<DeviceRestoreResult> {
    const sent = new Set<string>();
    const skipped: SkippedGroupDevice[] = [];
    let iteration = at.iteration;
    for (const [deviceId, values] of Object.entries(snapshot)) {
      for (const control of inRestoreOrder(Object.keys(values))) {
        const value = values[control];
        if (value === undefined) continue;
        try {
          await this.setter.set(
            {
              target: { kind: 'devices', deviceIds: [deviceId] },
              control,
              value: () => value,
              percent: false,
              serialised: true,
              at: { ...at, iteration },
            },
            run,
          );
          sent.add(deviceId);
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.code !== 'command_refused') throw cause;
          skipped.push({
            deviceId,
            reason: 'unsupported',
            detail: `${control}: ${failureLine(cause)}`,
          });
        }
        iteration += 1;
      }
    }
    if (sent.size === 0) {
      throw new ApiError('command_refused', 'None of the remembered devices could be restored.');
    }
    return { sent: [...sent], skipped };
  }
}
