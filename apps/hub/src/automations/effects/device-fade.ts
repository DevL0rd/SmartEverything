import type { DeviceTarget, SkippedGroupDevice } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import { runDelay } from './run-abort';
import type { CommandStamp } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectRun } from './effect-run';

const FADE_MIN_INTERVAL_MS = 1000;

export interface DeviceFadeRequest {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly from: number;
  readonly to: number;
  readonly overMs: number;
  readonly curve: 'linear' | 'ease';
  readonly step?: number;
  readonly percent: boolean;
  readonly at: CommandStamp;
}

export interface DeviceFadeResult {
  readonly sent: readonly string[];
  readonly skipped: readonly SkippedGroupDevice[];
  readonly last: number;
}

export function fadeLevels(
  request: Pick<DeviceFadeRequest, 'from' | 'to' | 'overMs' | 'curve' | 'step'>,
): readonly number[] {
  const { from, to, overMs, curve } = request;
  const distance = Math.abs(to - from);
  const byTime = Math.max(1, Math.floor(overMs / FADE_MIN_INTERVAL_MS));
  const byStep =
    request.step === undefined ? byTime : Math.max(1, Math.ceil(distance / request.step));
  const steps = Math.min(byTime, byStep);
  return Array.from({ length: steps }, (_, index) => {
    const progress = (index + 1) / steps;
    const eased = curve === 'ease' ? progress * progress * (3 - 2 * progress) : progress;
    return index === steps - 1 ? to : Math.round((from + (to - from) * eased) * 100) / 100;
  });
}

export class DeviceFader {
  constructor(
    private readonly setter: Pick<DeviceSetter, 'set'>,
    private readonly clock: Pick<Clock, 'now' | 'at'>,
  ) {}

  async fade(request: DeviceFadeRequest, run: EffectRun): Promise<DeviceFadeResult> {
    const levels = fadeLevels(request);
    const gap = request.overMs / levels.length;
    const sent = new Set<string>();
    let skipped: readonly SkippedGroupDevice[] = [];
    let last = request.from;
    for (const [index, level] of levels.entries()) {
      const result = await this.setter.set(
        {
          target: request.target,
          control: request.control,
          value: () => level,
          percent: request.percent,
          serialised: true,
          at: { ...request.at, iteration: request.at.iteration + index },
        },
        run,
      );
      for (const id of result.sent) sent.add(id);
      skipped = result.skipped;
      last = level;
      if (index < levels.length - 1) await runDelay(this.clock, gap, run);
    }
    return { sent: [...sent], skipped, last };
  }
}
