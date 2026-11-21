import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { ChangeFeed } from '../store/feed';
import type { Store } from '../store/store';
import { DeviceEnsurer, EnsureNotConfirmedError } from './effects/device-ensure';
import { DeviceFader } from './effects/device-fade';
import { DeviceRestorer } from './effects/device-restore';
import { admittedMembers, type DeviceSetter } from './effects/device-set';
import { stampOf } from './effects/command-metadata';
import { invalid, outputs, parsed } from './engine-v3-effects';
import { modeOf } from './effects/action-mode';
import { effectFailure } from './effect-failure';
import type { EffectHandler, EffectHandlers } from './engine-v3-effects';
import { SNAPSHOT_VALUE } from './world-v3/snapshot';
import { TARGET_VALUE } from './world-v3/refs';

export interface DeviceExtraPorts {
  readonly setter: Pick<DeviceSetter, 'set' | 'setTogether'>;
  readonly store: Store;
  readonly feed: Pick<ChangeFeed, 'subscribe'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly observed: (deviceId: string, capability: string) => JsonValue | undefined;
}

const ENSURE_PARAMS = z.object({
  target: TARGET_VALUE,
  control: z.string().min(1),
  to: JSON_VALUE,
  tries: z.number().int().min(1).max(10).default(3),
  verifyWithin: z.number().int().min(1).default(10_000),
});

const FADE_PARAMS = z.object({
  target: TARGET_VALUE,
  control: z.string().min(1),
  from: z.number().optional(),
  to: z.number(),
  over: z.number().int().min(1),
  curve: z.enum(['linear', 'ease']).default('linear'),
  step: z.number().positive().optional(),
});

const RESTORE_PARAMS = z.object({ snapshot: SNAPSHOT_VALUE });

function deviceEnsure(ports: DeviceExtraPorts): EffectHandler {
  const ensurer = new DeviceEnsurer({
    setter: ports.setter,
    feed: ports.feed,
    clock: ports.clock,
    reported: ports.observed,
  });
  return async (params, request, run) => {
    const checked = parsed(ENSURE_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const result = await ensurer.ensure(
        {
          target: ask.target,
          control: ask.control,
          value: ask.to,
          percent: false,
          tries: ask.tries,
          verifyWithinMs: ask.verifyWithin,
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ok: true, ...result }) };
    } catch (cause) {
      if (cause instanceof EnsureNotConfirmedError) {
        return { ok: false, class: 'Unreachable', message: cause.message };
      }
      return effectFailure(cause);
    }
  };
}

async function startLevel(
  ports: DeviceExtraPorts,
  ask: z.infer<typeof FADE_PARAMS>,
): Promise<number | undefined> {
  if (ask.from !== undefined) return ask.from;
  const [member] = await admittedMembers(ports.store, ask.target, ask.control);
  const level = member === undefined ? undefined : ports.observed(member.deviceId, ask.control);
  return typeof level === 'number' ? level : undefined;
}

function deviceFade(ports: DeviceExtraPorts): EffectHandler {
  const fader = new DeviceFader(ports.setter, ports.clock);
  return async (params, request, run) => {
    const checked = parsed(FADE_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    const from = await startLevel(ports, ask);
    if (from === undefined) {
      return invalid(
        'The fade has no level to start from; give one or use a control with a level.',
      );
    }
    try {
      const result = await fader.fade(
        {
          target: ask.target,
          control: ask.control,
          from,
          to: ask.to,
          overMs: ask.over,
          curve: ask.curve,
          ...(ask.step === undefined ? {} : { step: ask.step }),
          percent: false,
          mode: modeOf(request),
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ok: true, ...result, value: result.last }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function deviceRestore(ports: DeviceExtraPorts): EffectHandler {
  const restorer = new DeviceRestorer(ports.setter);
  return async (params: Outputs, request, run) => {
    const checked = parsed(RESTORE_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const result = await restorer.restore(
        checked.value.snapshot,
        stampOf(request.path),
        run,
        modeOf(request),
      );
      return { ok: true, value: outputs({ ok: true, ...result }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function deviceExtraHandlers(ports: DeviceExtraPorts): EffectHandlers {
  return {
    'device.ensure': deviceEnsure(ports),
    'device.fade': deviceFade(ports),
    'device.restore': deviceRestore(ports),
  };
}
