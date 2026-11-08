import {
  ApiError,
  privacySwitchOf,
  targetCapability,
  type ActionMode,
  type DeviceRow,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import { z } from 'zod';
import { resolveTarget } from '../../device-groups/commands';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import {
  CAMERA_TARGET,
  CAMERA_VALUE,
  isCamera,
  skippedOutput,
  type Skipped,
} from './camera-support';
import { stampOf, type CommandStamp } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';

export interface CameraEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'set' | 'setTogether'>;
}

const ID = z.string().min(1);

const SWITCH = z.enum(['on', 'off', 'keep']).default('keep');

const MOVE_PARAMS = z.object({
  camera: CAMERA_VALUE,
  preset: ID.optional(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  steps: z.number().int().min(1).default(1),
});

const SET_PARAMS = z.object({
  target: CAMERA_TARGET.optional(),
  everyCamera: z.boolean().default(false),
  privacy: SWITCH,
  motionDetection: SWITCH,
  nightVision: ID.optional(),
  statusLight: SWITCH,
});

type SetAsk = z.infer<typeof SET_PARAMS>;

interface Change {
  readonly control: string;
  readonly value: JsonValue;
}

interface Sending {
  readonly mode: ActionMode;
  readonly at: CommandStamp;
  readonly run: EffectRun;
}

function writable(device: DeviceRow, control: string): PresentedCapability | undefined {
  const presented = targetCapability(device, control);
  return presented?.writable === true ? presented : undefined;
}

function movable(store: Store, id: string, control: 'ptz' | 'ptz_preset'): DeviceRow {
  const device = store.devices.find(id);
  if (device === undefined) throw new ApiError('not_found', 'There is no such camera.');
  if (!isCamera(device)) throw new ApiError('invalid_request', `${device.name} is not a camera.`);
  if (writable(device, control) === undefined)
    throw new ApiError(
      'command_refused',
      control === 'ptz'
        ? `${device.name} cannot be turned.`
        : `${device.name} has no saved positions to turn to.`,
    );
  return device;
}

async function turnSteps(
  ports: CameraEffectPorts,
  device: DeviceRow,
  turn: { readonly direction: string; readonly steps: number },
  sending: Sending,
): Promise<void> {
  for (let step = 0; step < turn.steps; step += 1) {
    await ports.setter.set(
      {
        target: { kind: 'devices', deviceIds: [device.id] },
        control: 'ptz',
        value: () => ({ direction: turn.direction }),
        percent: false,
        serialised: false,
        requireAll: true,
        mode: sending.mode,
        at: { ...sending.at, iteration: sending.at.iteration + step },
      },
      sending.run,
    );
  }
}

async function turnToPreset(
  ports: CameraEffectPorts,
  device: DeviceRow,
  preset: string,
  sending: Sending,
): Promise<void> {
  await ports.setter.set(
    {
      target: { kind: 'devices', deviceIds: [device.id] },
      control: 'ptz_preset',
      value: () => preset,
      percent: false,
      serialised: false,
      requireAll: true,
      mode: sending.mode,
      at: sending.at,
    },
    sending.run,
  );
}

function cameraMove(ports: CameraEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(MOVE_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    if ((ask.preset === undefined) === (ask.direction === undefined))
      return invalid('Choose either a saved position or a direction to move the camera.');
    const sending: Sending = {
      mode: modeOf(request),
      at: stampOf(request.path),
      run,
    };
    try {
      if (ask.preset !== undefined)
        await turnToPreset(
          ports,
          movable(ports.store, ask.camera, 'ptz_preset'),
          ask.preset,
          sending,
        );
      else if (ask.direction !== undefined)
        await turnSteps(
          ports,
          movable(ports.store, ask.camera, 'ptz'),
          { direction: ask.direction, steps: ask.steps },
          sending,
        );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function switchChange(
  device: DeviceRow,
  control: string,
  choice: SetAsk['motionDetection'],
): Change | undefined {
  if (choice === 'keep') return undefined;
  const presented = writable(device, control);
  return presented === undefined ? undefined : { control: presented.key, value: choice === 'on' };
}

function privacyChange(device: DeviceRow, choice: SetAsk['privacy']): Change | undefined {
  if (choice === 'keep') return undefined;
  const privacy = privacySwitchOf(device);
  if (privacy?.writable !== true) return undefined;
  return { control: privacy.key, value: (choice === 'on') === privacy.privateWhen };
}

function nightVisionChange(
  device: DeviceRow,
  choice: string | undefined,
): Change | string | undefined {
  if (choice === undefined) return undefined;
  const presented = writable(device, 'night_vision');
  if (presented === undefined) return undefined;
  const offered = presented.options.map((option) => option.value);
  return offered.includes(choice)
    ? { control: presented.key, value: choice }
    : `${presented.label} does not offer ${JSON.stringify(choice)} (it offers ${offered.join(', ')}).`;
}

function askedAnything(ask: SetAsk): boolean {
  return (
    ask.privacy !== 'keep' ||
    ask.motionDetection !== 'keep' ||
    ask.nightVision !== undefined ||
    ask.statusLight !== 'keep'
  );
}

function planCamera(device: DeviceRow, ask: SetAsk): readonly Change[] | string {
  const night = nightVisionChange(device, ask.nightVision);
  if (typeof night === 'string') return night;
  const changes = [
    privacyChange(device, ask.privacy),
    switchChange(device, 'motion_detection', ask.motionDetection),
    night,
    switchChange(device, 'status_light', ask.statusLight),
  ].flatMap((change) => (change === undefined ? [] : [change]));
  return changes.length === 0 ? 'It has none of the camera settings asked for.' : changes;
}

function camerasOf(store: Store, ask: SetAsk): readonly DeviceRow[] {
  if (ask.everyCamera)
    return store.devices.list().filter((device) => !device.hidden && isCamera(device));
  if (ask.target === undefined) return [];
  return resolveTarget(store, ask.target);
}

async function sendCamera(
  ports: CameraEffectPorts,
  device: DeviceRow,
  changes: readonly Change[],
  sending: Sending,
): Promise<Skipped | undefined> {
  try {
    await ports.setter.setTogether(
      { deviceId: device.id, changes, mode: sending.mode, at: sending.at },
      sending.run,
    );
    return undefined;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'command_refused')
      return { deviceId: device.id, reason: cause.message };
    throw cause;
  }
}

function preflight(ask: SetAsk): string | undefined {
  if (ask.everyCamera && ask.target !== undefined)
    return 'Choose a target or turn on Every camera, not both.';
  if (!ask.everyCamera && ask.target === undefined)
    return 'Choose which cameras to change, or turn on Every camera.';
  return askedAnything(ask) ? undefined : 'Choose at least one thing to change on the cameras.';
}

async function setCameras(
  ports: CameraEffectPorts,
  ask: SetAsk,
  sending: Sending,
): Promise<{ readonly sent: readonly string[]; readonly skipped: readonly Skipped[] }> {
  const devices = camerasOf(ports.store, ask);
  if (devices.length === 0) throw new ApiError('not_found', 'This target has no cameras.');
  const skipped: Skipped[] = [];
  const plans: { readonly device: DeviceRow; readonly changes: readonly Change[] }[] = [];
  for (const device of devices) {
    const changes = isCamera(device) ? planCamera(device, ask) : 'It is not a camera.';
    if (typeof changes === 'string') skipped.push({ deviceId: device.id, reason: changes });
    else if (!device.online) skipped.push({ deviceId: device.id, reason: 'It is offline.' });
    else plans.push({ device, changes });
  }
  const refused = (
    await Promise.all(plans.map((plan) => sendCamera(ports, plan.device, plan.changes, sending)))
  ).flatMap((left) => (left === undefined ? [] : [left]));
  const left = [...skipped, ...refused];
  const sent = plans
    .map((plan) => plan.device.id)
    .filter((id) => !refused.some((entry) => entry.deviceId === id));
  if (sent.length === 0)
    throw new ApiError(
      'command_refused',
      `None of the cameras could be changed: ${left.map((entry) => entry.reason).join(' ')}`,
    );
  return { sent, skipped: left };
}

function cameraSet(ports: CameraEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(SET_PARAMS, params);
    if (!checked.ok) return checked;
    const problem = preflight(checked.value);
    if (problem !== undefined) return invalid(problem);
    try {
      const done = await setCameras(ports, checked.value, {
        mode: modeOf(request),
        at: stampOf(request.path),
        run,
      });
      return {
        ok: true,
        value: outputs({ sent: deviceRefs(done.sent), skipped: skippedOutput(done.skipped) }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function cameraEffects(ports: CameraEffectPorts): EffectHandlers {
  return { 'camera.move': cameraMove(ports), 'camera.set': cameraSet(ports) };
}
