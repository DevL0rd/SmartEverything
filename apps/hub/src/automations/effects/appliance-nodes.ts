import {
  ApiError,
  JSON_VALUE,
  skippedText,
  targetCapability,
  type DeviceTarget,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import { z } from 'zod';
import { resolveTarget } from '../../device-groups/commands';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { TARGET_VALUE, deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetResult, DeviceSetter } from './device-set';
import type { EffectHandlers } from './effect-run';

export interface ApplianceEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'set'>;
}

const SET_PARAMS = z.object({
  target: TARGET_VALUE,
  setting: z.string().min(1),
  value: JSON_VALUE,
  requireAll: z.boolean().default(false),
});

const ACTION_PARAMS = z.object({
  target: TARGET_VALUE,
  action: z.string().min(1),
  requireAll: z.boolean().default(false),
});

type ControlKind = 'setting' | 'action';

function isActionKind(presented: PresentedCapability): boolean {
  return presented.capability.value.kind === 'action';
}

function writableControls(
  ports: ApplianceEffectPorts,
  target: DeviceTarget,
  reference: string,
): readonly PresentedCapability[] {
  return resolveTarget(ports.store, target).flatMap((device) => {
    const presented = targetCapability(device, reference);
    return presented?.writable === true ? [presented] : [];
  });
}

function ensureControl(
  ports: ApplianceEffectPorts,
  target: DeviceTarget,
  reference: string,
  wanted: ControlKind,
): void {
  const found = writableControls(ports, target, reference);
  if (found.length === 0)
    throw new ApiError(
      'invalid_request',
      `None of these devices has "${reference}" as something that can be ${wanted === 'action' ? 'run' : 'changed'}.`,
    );
  const matching = found.filter((presented) => isActionKind(presented) === (wanted === 'action'));
  if (matching.length > 0) return;
  const label = found[0]?.label ?? reference;
  throw new ApiError(
    'invalid_request',
    wanted === 'action'
      ? `${label} is a setting. Use Change appliance setting to change it.`
      : `${label} is an action. Use Run device action to run it.`,
  );
}

function skippedOutput(result: DeviceSetResult): JsonValue {
  return result.skipped.map((skip) => ({
    device: { device: skip.deviceId },
    reason: skippedText(skip),
  }));
}

function sentOutputs(result: DeviceSetResult): Record<string, JsonValue> {
  return { ok: true, sent: deviceRefs(result.sent), skipped: skippedOutput(result) };
}

function applianceSet(ports: ApplianceEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(SET_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      ensureControl(ports, ask.target, ask.setting, 'setting');
      const result = await ports.setter.set(
        {
          target: ask.target,
          control: ask.setting,
          value: () => ask.value,
          percent: false,
          serialised: false,
          requireAll: ask.requireAll,
          mode: modeOf(request),
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ...sentOutputs(result), value: ask.value }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function deviceAction(ports: ApplianceEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(ACTION_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      ensureControl(ports, ask.target, ask.action, 'action');
      const result = await ports.setter.set(
        {
          target: ask.target,
          control: ask.action,
          value: () => null,
          percent: false,
          serialised: false,
          requireAll: ask.requireAll,
          mode: modeOf(request),
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs(sentOutputs(result)) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function applianceEffects(ports: ApplianceEffectPorts): EffectHandlers {
  return { 'appliance.set': applianceSet(ports), 'device.action': deviceAction(ports) };
}
