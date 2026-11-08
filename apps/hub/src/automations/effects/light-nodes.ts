import {
  ApiError,
  JSON_VALUE,
  colorFromInput,
  deviceFamily,
  targetCapability,
  targetValue,
  type DeviceRow,
  type HsvColor,
  type JsonValue,
} from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { Logger, failureLine } from '@smarteverything/logging';
import { z } from 'zod';
import type { Clock } from '../../clock';
import { resolveTarget } from '../../device-groups/commands';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { TARGET_VALUE, deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf, type CommandStamp } from './command-metadata';
import { DeviceFader, fadeLevels } from './device-fade';
import type { DeviceSetter } from './device-set';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';

const log = new Logger('hub.automations');

export interface LightEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly setter: Pick<DeviceSetter, 'set' | 'setTogether'>;
}

const LIGHT_PARAMS = z.object({
  target: TARGET_VALUE,
  power: z.enum(['on', 'off', 'keep']).default('keep'),
  brightness: z.number().min(0).max(100).optional(),
  color: JSON_VALUE.optional(),
  colorTemperature: z.number().positive().optional(),
  effect: z.string().min(1).optional(),
  transition: z.number().min(0).optional(),
});

type Presented = NonNullable<ReturnType<typeof targetCapability>>;
type LightParams = z.infer<typeof LIGHT_PARAMS>;

interface Change {
  readonly control: string;
  readonly value: JsonValue;
}

interface Wanted {
  readonly label: string;
  readonly control: string;
  readonly value: (presented: Presented) => JsonValue;
}

interface Fade {
  readonly control: string;
  readonly from: number;
  readonly to: number;
  readonly iteration: number;
}

interface Draft {
  readonly deviceId: string;
  readonly changes: readonly Change[];
  readonly fade: Omit<Fade, 'iteration'> | undefined;
}

interface DevicePlan {
  readonly deviceId: string;
  readonly changes: readonly Change[];
  readonly fade: Fade | undefined;
  readonly iteration: number;
}

interface Skipped {
  readonly deviceId: string;
  readonly reason: string;
}

interface Sent {
  readonly deviceId: string;
  readonly skipped?: Skipped;
}

type ColourAsk =
  | { readonly kind: 'none' }
  | { readonly kind: 'colour'; readonly colour: HsvColor }
  | { readonly kind: 'white'; readonly kelvin: number };

function wantedOf(ask: LightParams, colour: ColourAsk): readonly Wanted[] {
  const { brightness } = ask;
  const wanted: Wanted[] = [];
  if (brightness !== undefined)
    wanted.push({
      label: 'brightness',
      control: 'brightness',
      value: (presented) => targetValue(presented, brightness, true),
    });
  if (colour.kind === 'colour')
    wanted.push({ label: 'colour', control: 'color', value: () => colour.colour });
  if (colour.kind === 'white')
    wanted.push({
      label: 'white',
      control: 'color_temperature',
      value: () => colour.kelvin,
    });
  if (ask.effect !== undefined) {
    const { effect } = ask;
    wanted.push({ label: 'effect', control: 'light_effect', value: () => effect });
  }
  if (ask.power !== 'keep') {
    const on = ask.power === 'on';
    wanted.push({ label: 'power', control: 'power', value: () => on });
  }
  return wanted;
}

function colourOf(ask: LightParams): ColourAsk | string {
  if (ask.color !== undefined && ask.colorTemperature !== undefined)
    return 'A colour and a white temperature cannot be set together; give one.';
  if (ask.color !== undefined) {
    const colour = colorFromInput(ask.color);
    return colour === null
      ? 'The colour is not one the lights understand.'
      : { kind: 'colour', colour };
  }
  return ask.colorTemperature === undefined
    ? { kind: 'none' }
    : { kind: 'white', kelvin: ask.colorTemperature };
}

function writable(device: DeviceRow, control: string): Presented | undefined {
  const presented = targetCapability(device, control);
  return presented?.writable === true ? presented : undefined;
}

function brightnessFade(
  store: Store,
  device: DeviceRow,
  ask: LightParams,
  wanted: readonly Wanted[],
): { readonly control: string; readonly from: number; readonly to: number } | undefined {
  const target = wanted.find((entry) => entry.control === 'brightness');
  const presented = writable(device, 'brightness');
  if (target === undefined || presented === undefined || ask.power === 'off') return undefined;
  if ((ask.transition ?? 0) <= 0) return undefined;
  const to = target.value(presented);
  const from = store.state.value(device.id, presented.key);
  return typeof to === 'number' && typeof from === 'number'
    ? { control: presented.key, from, to }
    : undefined;
}

function planDevice(
  store: Store,
  device: DeviceRow,
  ask: LightParams,
  wanted: readonly Wanted[],
): Draft | string {
  const faded = brightnessFade(store, device, ask, wanted);
  const changes: Change[] = [];
  const ignored: string[] = [];
  for (const entry of wanted) {
    const presented = writable(device, entry.control);
    if (presented === undefined) ignored.push(entry.label);
    else if (faded === undefined || entry.control !== 'brightness')
      changes.push({ control: entry.control, value: entry.value(presented) });
  }
  if (changes.length === 0 && faded === undefined) return `It has none of ${ignored.join(', ')}.`;
  if (ignored.length > 0)
    log.debug('light.set.control_unsupported', () => ({
      deviceId: device.id,
      ignored: ignored.join(', '),
    }));
  return { deviceId: device.id, changes, fade: faded };
}

function numbered(drafts: readonly Draft[], base: number, overMs: number): readonly DevicePlan[] {
  let next = base;
  return drafts.map((draft) => {
    const iteration = next;
    next += draft.changes.length > 0 ? 1 : 0;
    const fadeAt = next;
    if (draft.fade !== undefined)
      next += fadeLevels({ ...draft.fade, overMs, curve: 'linear' }).length;
    return {
      deviceId: draft.deviceId,
      changes: draft.changes,
      iteration,
      fade: draft.fade === undefined ? undefined : { ...draft.fade, iteration: fadeAt },
    };
  });
}

function lightsOf(
  store: Store,
  ask: LightParams,
): { readonly lights: readonly DeviceRow[]; readonly skipped: readonly Skipped[] } {
  const devices = resolveTarget(store, ask.target);
  if (devices.length === 0) throw new ApiError('not_found', 'This target has no devices.');
  const skipped: Skipped[] = [];
  const lights: DeviceRow[] = [];
  for (const device of devices) {
    if (deviceFamily(device) !== 'light')
      skipped.push({ deviceId: device.id, reason: 'It is not a light.' });
    else if (!device.online) skipped.push({ deviceId: device.id, reason: 'It is offline.' });
    else lights.push(device);
  }
  return { lights, skipped };
}

interface Sending {
  readonly mode: ReturnType<typeof modeOf>;
  readonly at: CommandStamp;
  readonly overMs: number;
}

class LightSender {
  constructor(private readonly ports: LightEffectPorts) {}

  async send(plan: DevicePlan, sending: Sending, run: EffectRun): Promise<Sent> {
    const { deviceId } = plan;
    try {
      await Promise.all([this.together(plan, sending, run), this.fade(plan, sending, run)]);
      return { deviceId };
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.code !== 'command_refused') throw cause;
      return { deviceId, skipped: { deviceId, reason: failureLine(cause) } };
    }
  }

  private async together(plan: DevicePlan, sending: Sending, run: EffectRun): Promise<void> {
    if (plan.changes.length === 0) return;
    await this.ports.setter.setTogether(
      {
        deviceId: plan.deviceId,
        changes: plan.changes,
        mode: sending.mode,
        at: { ...sending.at, iteration: plan.iteration },
      },
      run,
    );
  }

  private async fade(plan: DevicePlan, sending: Sending, run: EffectRun): Promise<void> {
    const { fade } = plan;
    if (fade === undefined) return;
    const { setter, clock } = this.ports;
    await new DeviceFader(setter, clock).fade(
      {
        target: { kind: 'devices', deviceIds: [plan.deviceId] },
        control: fade.control,
        from: fade.from,
        to: fade.to,
        overMs: sending.overMs,
        curve: 'linear',
        percent: false,
        mode: sending.mode,
        at: { ...sending.at, iteration: fade.iteration },
      },
      run,
    );
  }
}

function skippedOutput(skipped: readonly Skipped[]): JsonValue {
  return skipped.map(({ deviceId, reason }) => ({ device: { device: deviceId }, reason }));
}

function announceFade(run: EffectRun, plans: readonly DevicePlan[], ask: LightParams): void {
  const fading = plans.filter((plan) => plan.fade !== undefined).length;
  if (fading === 0) return;
  log.warn('light.set.transition_fallback', {
    automationId: run.automationId,
    lights: fading,
    overMs: ask.transition ?? 0,
    reason: 'No light driver takes a native fade yet, so the hub steps the brightness itself.',
  });
}

function planned(
  ports: LightEffectPorts,
  ask: LightParams,
  colour: ColourAsk,
  request: EffectRequest,
): { readonly plans: readonly DevicePlan[]; readonly skipped: readonly Skipped[] } {
  const { lights, skipped } = lightsOf(ports.store, ask);
  const wanted = wantedOf(ask, colour);
  const drafts: Draft[] = [];
  const left = [...skipped];
  for (const light of lights) {
    const draft = planDevice(ports.store, light, ask, wanted);
    if (typeof draft === 'string') left.push({ deviceId: light.id, reason: draft });
    else drafts.push(draft);
  }
  return {
    plans: numbered(drafts, stampOf(request.path).iteration, ask.transition ?? 0),
    skipped: left,
  };
}

function lightSet(ports: LightEffectPorts): EffectHandler {
  const sender = new LightSender(ports);
  return async (params, request, run) => {
    const checked = parsed(LIGHT_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    const colour = colourOf(ask);
    if (typeof colour === 'string') return invalid(colour);
    const wanted = wantedOf(ask, colour);
    if (wanted.length === 0) return invalid('Choose at least one thing to change on the lights.');
    try {
      const { plans, skipped } = planned(ports, ask, colour, request);
      announceFade(run, plans, ask);
      const at = stampOf(request.path);
      const mode = modeOf(request);
      const results = await Promise.all(
        plans.map((plan) => sender.send(plan, { mode, at, overMs: ask.transition ?? 0 }, run)),
      );
      const refused = results.flatMap((result) =>
        result.skipped === undefined ? [] : [result.skipped],
      );
      const sent = results
        .filter((result) => result.skipped === undefined)
        .map((result) => result.deviceId);
      const left = [...skipped, ...refused];
      if (sent.length === 0)
        throw new ApiError(
          'command_refused',
          `None of the lights could be changed: ${left.map((entry) => entry.reason).join(' ')}`,
        );
      return { ok: true, value: outputs({ sent: deviceRefs(sent), skipped: skippedOutput(left) }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function lightEffects(ports: LightEffectPorts): EffectHandlers {
  return { 'light.set': lightSet(ports) };
}
