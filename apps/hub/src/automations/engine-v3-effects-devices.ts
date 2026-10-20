import { JSON_VALUE, capabilityOf, type CommandAction } from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { ChangeFeed } from '../store/feed';
import type { Store } from '../store/store';
import { DeviceEnsurer, EnsureNotConfirmedError } from './effects/device-ensure';
import { DeviceFader } from './effects/device-fade';
import { DeviceRestorer } from './effects/device-restore';
import { admittedMembers, type DeviceSetter } from './effects/device-set';
import { captureScene } from './effects/scene-capture';
import { resolveTarget } from '../device-groups/commands';
import { stampOf } from './effects/command-metadata';
import { invalid, outputs, parsed } from './engine-v3-effects';
import { effectFailure } from './effect-failure';
import type { EffectHandler, EffectHandlers } from './engine-v3-effects';
import { SNAPSHOT_VALUE } from './world-v3/snapshot';
import { TARGET_VALUE } from './world-v3/refs';

export interface DeviceExtraPorts {
  readonly setter: Pick<DeviceSetter, 'set'>;
  readonly store: Store;
  readonly feed: Pick<ChangeFeed, 'subscribe'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
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

const CAPTURE_PARAMS = z.object({
  target: TARGET_VALUE,
  name: z.string().min(1),
  overwrite: z.boolean().default(false),
});

const RESTORE_PARAMS = z.object({ snapshot: SNAPSHOT_VALUE });

function reportedBy(
  store: Store,
): (deviceId: string, capability: string) => ReturnType<Store['state']['value']> {
  return (deviceId, capability) => store.state.value(deviceId, capability);
}

function deviceEnsure(ports: DeviceExtraPorts): EffectHandler {
  const ensurer = new DeviceEnsurer({
    setter: ports.setter,
    feed: ports.feed,
    clock: ports.clock,
    reported: reportedBy(ports.store),
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

function startLevel(ports: DeviceExtraPorts, ask: z.infer<typeof FADE_PARAMS>): number | undefined {
  if (ask.from !== undefined) return ask.from;
  const [member] = admittedMembers(ports.store, ask.target, ask.control);
  const level =
    member === undefined ? undefined : ports.store.state.value(member.deviceId, ask.control);
  return typeof level === 'number' ? level : undefined;
}

function deviceFade(ports: DeviceExtraPorts): EffectHandler {
  const fader = new DeviceFader(ports.setter, ports.clock);
  return async (params, request, run) => {
    const checked = parsed(FADE_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    const from = startLevel(ports, ask);
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
      const result = await restorer.restore(checked.value.snapshot, stampOf(request.path), run);
      return { ok: true, value: outputs({ ok: true, ...result }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function sceneCapture(ports: DeviceExtraPorts): EffectHandler {
  return (params) => {
    const checked = parsed(CAPTURE_PARAMS, params);
    if (!checked.ok) return Promise.resolve(checked);
    const ask = checked.value;
    try {
      const actions = resolveTarget(ports.store, ask.target).flatMap((device): CommandAction[] =>
        device.capabilities.flatMap((entry): CommandAction[] => {
          const capability = capabilityOf(device, entry.key);
          if (capability === undefined || capability.access === 'read') return [];
          if (capability.value.kind === 'action') return [];
          const value = ports.store.state.value(device.id, entry.key);
          return value === undefined || value === null
            ? []
            : [{ type: 'command', deviceId: device.id, capability: entry.key, value }];
        }),
      );
      const scene = captureScene(ports.store, {
        name: ask.name,
        overwrite: ask.overwrite,
        actions,
      });
      return Promise.resolve({
        ok: true,
        value: outputs({ ok: true, scene: { scene: scene.id } }),
      });
    } catch (cause) {
      return Promise.resolve(effectFailure(cause));
    }
  };
}

export function deviceExtraHandlers(ports: DeviceExtraPorts): EffectHandlers {
  return {
    'device.ensure': deviceEnsure(ports),
    'device.fade': deviceFade(ports),
    'device.restore': deviceRestore(ports),
    'scene.capture': sceneCapture(ports),
  };
}
