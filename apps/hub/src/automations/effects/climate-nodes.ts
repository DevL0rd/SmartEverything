import {
  ApiError,
  CLIMATE_CONTROLS,
  targetCapability,
  type ClimateTemperatureUnit,
  type DeviceRow,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { ActionMode } from '@smarteverything/domain';
import { z } from 'zod';
import { resolveTarget } from '../../device-groups/commands';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { TARGET_VALUE, deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf, type CommandStamp } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandlers, EffectRun } from './effect-run';
import { AutomationRunCancelledError } from './run-abort';

export interface ClimateEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'setTogether'>;
}

const CLIMATE_PARAMS = z.object({
  target: TARGET_VALUE,
  power: z.enum(['on', 'off', 'keep']).default('keep'),
  mode: z.string().min(1).optional(),
  temperature: z.number().optional(),
  unit: z.enum(['c', 'f']).default('c'),
  fan: z.string().min(1).optional(),
  fanSpeed: z.number().optional(),
  swing: z.string().min(1).optional(),
  oscillation: z.boolean().optional(),
  offTimer: z.number().min(0).optional(),
});

type Ask = z.infer<typeof CLIMATE_PARAMS>;

type Converted =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly reason: string };

interface Want {
  readonly controls: readonly string[];
  readonly asked: (ask: Ask) => JsonValue | undefined;
  readonly value: (presented: PresentedCapability, asked: JsonValue, ask: Ask) => Converted;
}

interface Change {
  readonly control: string;
  readonly value: JsonValue;
}

interface DevicePlan {
  readonly device: DeviceRow;
  readonly changes: readonly Change[];
}

interface Skipped {
  readonly deviceId: string;
  readonly reason: string;
}

interface Sending {
  readonly mode: ActionMode;
  readonly at: CommandStamp;
  readonly run: EffectRun;
}

const MILLISECONDS_PER_TIMER_UNIT: ReadonlyMap<string, number> = new Map([
  ['s', 1000],
  ['min', 60_000],
  ['h', 3_600_000],
]);

const NO_CONTROLS = 'It has none of the climate settings asked for.';

function good(value: JsonValue): Converted {
  return { ok: true, value };
}

function bad(reason: string): Converted {
  return { ok: false, reason };
}

function temperatureUnitOf(unit: string | null): ClimateTemperatureUnit | undefined {
  if (unit === null) return undefined;
  if (/^[°º]?c$|^℃$/i.test(unit)) return 'c';
  if (/^[°º]?f$|^℉$/i.test(unit)) return 'f';
  return undefined;
}

function snapped(presented: PresentedCapability, value: number): number {
  const descriptor = presented.capability.value;
  if (descriptor.kind !== 'number') return value;
  const steps = Math.round((value - descriptor.min) / descriptor.step);
  return Number((descriptor.min + steps * descriptor.step).toFixed(6));
}

function withinRange(presented: PresentedCapability, value: number, shown: string): Converted {
  const descriptor = presented.capability.value;
  if (descriptor.kind !== 'number') return bad(`${presented.label} is not a number setting.`);
  if (value >= descriptor.min && value <= descriptor.max) return good(value);
  const unit = presented.unit === null ? '' : ` ${presented.unit}`;
  return bad(
    `${shown} is outside what ${presented.label} accepts (${String(descriptor.min)} to ${String(descriptor.max)}${unit}).`,
  );
}

function booleanValue(presented: PresentedCapability, asked: JsonValue): Converted {
  return presented.capability.value.kind === 'boolean'
    ? good(asked)
    : bad(`${presented.label} is not an on or off setting.`);
}

function choiceValue(presented: PresentedCapability, asked: JsonValue): Converted {
  if (presented.capability.value.kind !== 'enum')
    return bad(`${presented.label} is not a choice setting.`);
  const offered = presented.options.map((option) => option.value);
  return typeof asked === 'string' && offered.includes(asked)
    ? good(asked)
    : bad(
        `${presented.label} does not offer ${JSON.stringify(asked)} (it offers ${offered.join(', ')}).`,
      );
}

function numberValue(presented: PresentedCapability, asked: JsonValue): Converted {
  return typeof asked === 'number'
    ? withinRange(presented, asked, String(asked))
    : bad(`${presented.label} needs a number.`);
}

function temperatureValue(presented: PresentedCapability, asked: JsonValue, ask: Ask): Converted {
  if (typeof asked !== 'number') return bad(`${presented.label} needs a number.`);
  const own = temperatureUnitOf(presented.unit);
  const shown = `${String(asked)} °${ask.unit.toUpperCase()}`;
  if (own === ask.unit || (own === undefined && ask.unit === 'c'))
    return withinRange(presented, asked, shown);
  if (own === undefined) return bad(`${presented.label} does not say which unit it uses.`);
  const converted = ask.unit === 'c' ? (asked * 9) / 5 + 32 : ((asked - 32) * 5) / 9;
  return withinRange(presented, snapped(presented, converted), shown);
}

function timerValue(presented: PresentedCapability, asked: JsonValue): Converted {
  const per = presented.unit === null ? undefined : MILLISECONDS_PER_TIMER_UNIT.get(presented.unit);
  if (per === undefined || typeof asked !== 'number')
    return bad(`${presented.label} does not say which unit it counts in.`);
  return withinRange(presented, snapped(presented, asked / per), `${String(asked / 1000)} s`);
}

const WANTS: readonly Want[] = [
  {
    controls: CLIMATE_CONTROLS.power,
    asked: (ask) => (ask.power === 'keep' ? undefined : ask.power === 'on'),
    value: booleanValue,
  },
  { controls: CLIMATE_CONTROLS.mode, asked: (ask) => ask.mode, value: choiceValue },
  {
    controls: CLIMATE_CONTROLS.temperature,
    asked: (ask) => ask.temperature,
    value: temperatureValue,
  },
  { controls: CLIMATE_CONTROLS.fan, asked: (ask) => ask.fan, value: choiceValue },
  { controls: CLIMATE_CONTROLS.fanSpeed, asked: (ask) => ask.fanSpeed, value: numberValue },
  { controls: CLIMATE_CONTROLS.swing, asked: (ask) => ask.swing, value: choiceValue },
  {
    controls: CLIMATE_CONTROLS.oscillation,
    asked: (ask) => ask.oscillation,
    value: booleanValue,
  },
  { controls: CLIMATE_CONTROLS.offTimer, asked: (ask) => ask.offTimer, value: timerValue },
];

function writableControl(
  device: DeviceRow,
  controls: readonly string[],
): PresentedCapability | undefined {
  for (const name of controls) {
    const found = targetCapability(device, name);
    if (found?.writable === true) return found;
  }
  return undefined;
}

function askedOf(ask: Ask): readonly { readonly want: Want; readonly asked: JsonValue }[] {
  return WANTS.flatMap((want) => {
    const asked = want.asked(ask);
    return asked === undefined ? [] : [{ want, asked }];
  });
}

function planDevice(device: DeviceRow, ask: Ask): DevicePlan | string {
  const changes: Change[] = [];
  for (const { want, asked } of askedOf(ask)) {
    const presented = writableControl(device, want.controls);
    if (presented === undefined) continue;
    const converted = want.value(presented, asked, ask);
    if (!converted.ok) return converted.reason;
    changes.push({ control: presented.key, value: converted.value });
  }
  return changes.length === 0 ? NO_CONTROLS : { device, changes };
}

async function sendDevice(
  ports: ClimateEffectPorts,
  plan: DevicePlan,
  sending: Sending,
): Promise<Skipped | undefined> {
  try {
    await ports.setter.setTogether(
      {
        deviceId: plan.device.id,
        changes: plan.changes,
        mode: sending.mode,
        at: sending.at,
      },
      sending.run,
    );
    return undefined;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'command_refused')
      return { deviceId: plan.device.id, reason: cause.message };
    throw cause;
  }
}

async function sendAll(
  ports: ClimateEffectPorts,
  plans: readonly DevicePlan[],
  sending: Sending,
): Promise<readonly (Skipped | undefined)[]> {
  const settled = await Promise.allSettled(plans.map((plan) => sendDevice(ports, plan, sending)));
  const rejections = settled.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const failed =
    rejections.find((result) => result.reason instanceof AutomationRunCancelledError) ??
    rejections[0];
  if (failed !== undefined) throw failed.reason;
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function skippedOutput(skipped: readonly Skipped[]): JsonValue {
  return skipped.map(({ deviceId, reason }) => ({ device: { device: deviceId }, reason }));
}

function nothingChanged(devices: readonly DeviceRow[], skipped: readonly Skipped[]): ApiError {
  const names = new Map(devices.map((device) => [device.id, device.name]));
  const lines = skipped.map(
    ({ deviceId, reason }) => `${names.get(deviceId) ?? deviceId}: ${reason}`,
  );
  return new ApiError(
    'command_refused',
    `None of the climate devices could be changed. ${lines.join(' ')}`,
  );
}

async function setClimate(
  ports: ClimateEffectPorts,
  ask: Ask,
  sending: Sending,
): Promise<{ readonly sent: readonly string[]; readonly skipped: readonly Skipped[] }> {
  const devices = resolveTarget(ports.store, ask.target);
  if (devices.length === 0) throw new ApiError('not_found', 'This target has no devices.');
  const plans: DevicePlan[] = [];
  const skipped: Skipped[] = [];
  for (const device of devices) {
    const plan = planDevice(device, ask);
    if (typeof plan === 'string') skipped.push({ deviceId: device.id, reason: plan });
    else plans.push(plan);
  }
  const refused = (await sendAll(ports, plans, sending)).flatMap((left) =>
    left === undefined ? [] : [left],
  );
  const left = [...skipped, ...refused];
  const sent = plans
    .map((plan) => plan.device.id)
    .filter((id) => !refused.some((entry) => entry.deviceId === id));
  if (sent.length === 0) throw nothingChanged(devices, left);
  return { sent, skipped: left };
}

function climateSet(ports: ClimateEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(CLIMATE_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    if (askedOf(ask).length === 0)
      return invalid('Choose at least one thing to change on the climate devices.');
    try {
      const done = await setClimate(ports, ask, {
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

export function climateEffects(ports: ClimateEffectPorts): EffectHandlers {
  return { 'climate.set': climateSet(ports) };
}
