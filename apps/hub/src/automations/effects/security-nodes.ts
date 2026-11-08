import { ApiError, skippedText, type DeviceTarget, type JsonValue } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { TARGET_VALUE, deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';

export interface SecurityEffectPorts {
  readonly setter: Pick<DeviceSetter, 'set'>;
}

const LOCK_PARAMS = z.object({ target: TARGET_VALUE, locked: z.boolean().default(true) });

const ALARM_PARAMS = z.object({ target: TARGET_VALUE, mode: z.string().min(1) });

const COVER_PARAMS = z.object({
  target: TARGET_VALUE,
  action: z.enum(['open', 'close', 'stop', 'position']).default('open'),
  position: z.number().min(0).max(100).optional(),
});

interface Change {
  readonly target: DeviceTarget;
  readonly control: string;
  readonly value: JsonValue;
  readonly percent: boolean;
}

function requireOwner(): void {
  const authority = currentExecutionAuthority();
  if (authority !== undefined && executionRole(authority) !== 'owner')
    throw new ApiError('forbidden', 'Only the owner can lock or unlock a door from an automation.');
}

async function send(
  ports: SecurityEffectPorts,
  change: Change,
  request: EffectRequest,
  run: EffectRun,
): Promise<NodeResult> {
  try {
    const result = await ports.setter.set(
      {
        target: change.target,
        control: change.control,
        value: () => change.value,
        percent: change.percent,
        serialised: false,
        mode: modeOf(request),
        at: stampOf(request.path),
      },
      run,
    );
    return {
      ok: true,
      value: outputs({
        sent: deviceRefs(result.sent),
        skipped: result.skipped.map((skip) => ({
          device: { device: skip.deviceId },
          reason: skippedText(skip),
        })),
      }),
    };
  } catch (cause) {
    return effectFailure(cause);
  }
}

function lockSet(ports: SecurityEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(LOCK_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      requireOwner();
    } catch (cause) {
      return effectFailure(cause);
    }
    const { target, locked } = checked.value;
    return send(ports, { target, control: 'lock', value: locked, percent: false }, request, run);
  };
}

function alarmSet(ports: SecurityEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(ALARM_PARAMS, params);
    if (!checked.ok) return checked;
    const { target, mode } = checked.value;
    return send(ports, { target, control: 'alarm', value: mode, percent: false }, request, run);
  };
}

function coverChange(ask: z.infer<typeof COVER_PARAMS>): Change | string {
  if (ask.action !== 'position')
    return { target: ask.target, control: 'cover_action', value: ask.action, percent: false };
  if (ask.position === undefined) return 'Choose how far open the blinds should go.';
  return { target: ask.target, control: 'cover_position', value: ask.position, percent: true };
}

function coverSet(ports: SecurityEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(COVER_PARAMS, params);
    if (!checked.ok) return checked;
    const change = coverChange(checked.value);
    if (typeof change === 'string') return invalid(change);
    return send(ports, change, request, run);
  };
}

export function securityEffects(ports: SecurityEffectPorts): EffectHandlers {
  return {
    'lock.set': lockSet(ports),
    'alarm.set': alarmSet(ports),
    'cover.set': coverSet(ports),
  };
}
