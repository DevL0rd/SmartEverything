import type { ActionMode, DeviceTarget, SkippedGroupDevice } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import { runDelay } from './run-abort';
import type { CommandStamp } from './command-metadata';
import type { DeviceSetResult, DeviceSetter } from './device-set';
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
  readonly mode?: ActionMode;
  readonly at: CommandStamp;
}

type Step =
  | { readonly ok: true; readonly result: DeviceSetResult }
  | { readonly ok: false; readonly cause: unknown };

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
    const startedAt = this.clock.now().getTime();
    const steps: Promise<Step>[] = [];
    for (const [index, level] of levels.entries()) {
      const final = index === levels.length - 1;
      steps.push(
        this.setter
          .set(
            {
              target: request.target,
              control: request.control,
              value: () => level,
              percent: request.percent,
              serialised: false,
              snapped: !final,
              ...(final && request.mode !== undefined ? { mode: request.mode } : {}),
              at: { ...request.at, iteration: request.at.iteration + index },
            },
            run,
          )
          .then(
            (result): Step => ({ ok: true, result }),
            (cause: unknown): Step => ({ ok: false, cause }),
          ),
      );
      if (final) break;
      const wait = startedAt + gap * (index + 1) - this.clock.now().getTime();
      if (wait > 0) await runDelay(this.clock, wait, run);
    }
    const settled = await Promise.all(steps);
    const sent = new Set<string>();
    let skipped: readonly SkippedGroupDevice[] = [];
    for (const step of settled) {
      if (!step.ok) throw step.cause;
      for (const id of step.result.sent) sent.add(id);
      skipped = step.result.skipped;
    }
    return { sent: [...sent], skipped, last: levels.at(-1) ?? request.from };
  }
}
