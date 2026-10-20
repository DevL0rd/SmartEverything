import type { DeviceTarget, JsonValue, SkippedGroupDevice } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';
import type { CommandStamp } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectRun } from './effect-run';
import { reportedWithin } from './reported-value';
import { jsonEquals } from '@smarteverything/domain';

export class EnsureNotConfirmedError extends Error {
  override readonly name = 'EnsureNotConfirmedError';

  constructor(
    readonly control: string,
    readonly attempts: number,
  ) {
    super(`The devices did not report ${control} as asked after ${String(attempts)} tries.`);
  }
}

export interface DeviceEnsureRequest {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly value: JsonValue;
  readonly percent: boolean;
  readonly tries: number;
  readonly verifyWithinMs: number;
  readonly at: CommandStamp;
}

export interface DeviceEnsureResult {
  readonly attempts: number;
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
}

export interface DeviceEnsurePorts {
  readonly setter: Pick<DeviceSetter, 'set'>;
  readonly feed: Pick<ChangeFeed, 'subscribe'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly reported: (deviceId: string, capability: string) => JsonValue | undefined;
}

export class DeviceEnsurer {
  constructor(private readonly ports: DeviceEnsurePorts) {}

  async ensure(request: DeviceEnsureRequest, run: EffectRun): Promise<DeviceEnsureResult> {
    const { setter, feed, clock, reported } = this.ports;
    for (let attempt = 1; attempt <= request.tries; attempt += 1) {
      const sent = await setter.set(
        {
          target: request.target,
          control: request.control,
          value: () => request.value,
          percent: request.percent,
          serialised: true,
          at: { ...request.at, attempt: request.at.attempt + attempt - 1 },
        },
        run,
      );
      const holds = (): boolean =>
        sent.sent.every((id) => {
          const seen = reported(id, request.control);
          return seen !== undefined && jsonEquals(seen, request.value);
        });
      if (await reportedWithin({ feed, clock, holds, withinMs: request.verifyWithinMs }, run)) {
        return { attempts: attempt, sent: sent.sent, skipped: sent.skipped };
      }
    }
    throw new EnsureNotConfirmedError(request.control, request.tries);
  }
}
