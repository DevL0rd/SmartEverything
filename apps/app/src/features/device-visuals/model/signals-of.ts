import {
  MODEL_SIGNALS,
  isLaundryRunning,
  type DeviceFamily,
  type ModelSignalName,
  type ModelSignalValue,
} from '@smarteverything/domain';
import { colord } from 'colord';
import type { VisualState } from '../types';
import {
  buttonEntries,
  cameraEntries,
  coverEntries,
  doorbellEntries,
  lockEntries,
  sensorEntries,
  socketEntries,
} from './signals-of-access';
import {
  bottleEntries,
  fileSyncEntries,
  printerEntries,
  robotEntries,
  toothbrushEntries,
  treadmillEntries,
  vacuumEntries,
} from './signals-of-machines';
import {
  phoneEntries,
  scaleEntries,
  speakerEntries,
  televisionEntries,
  wearableEntries,
} from './signals-of-media';
import { irBlasterEntries, irRemoteEntries } from './signals-of-remote';
import type { EntriesOf, SignalEntry } from './signals-of-units';

type DiffuserFacts = NonNullable<VisualState['diffuser']>;
type LaundryFacts = NonNullable<VisualState['laundry']>;
type MicrowaveFacts = NonNullable<VisualState['microwave']>;
type ThermalMode = VisualState['thermal'];

export type ModelSignals = Readonly<Partial<Record<ModelSignalName, ModelSignalValue>>>;

export type FamilySignals = (state: VisualState) => ModelSignals;

export function signals(entries: readonly SignalEntry[]): ModelSignals {
  const kept: Partial<Record<ModelSignalName, ModelSignalValue>> = {};
  for (const [name, value] of entries) {
    if (value === undefined) continue;
    if (value === null && !isNullable(name)) continue;
    kept[name] = value;
  }
  return kept;
}

function isNullable(name: ModelSignalName): boolean {
  const definition = MODEL_SIGNALS[name];
  return (
    (definition.kind === 'unit' || definition.kind === 'number') && definition.nullable === true
  );
}

export function hexOf(css: string | null): string | undefined {
  if (css === null) return undefined;
  const parsed = colord(css);
  return parsed.isValid() ? parsed.alpha(1).toHex() : undefined;
}

function textOrUndefined(text: string | null | undefined): string | undefined {
  return text === null || text === undefined || text === '' ? undefined : text;
}

function powerOf(state: VisualState): boolean | undefined {
  return state.power === 'unknown' ? undefined : state.power === 'on';
}

const THERMAL: Readonly<Record<ThermalMode, string>> = {
  heat: 'heating',
  cool: 'cooling',
  idle: 'idle',
};

function airFlow(state: VisualState): readonly SignalEntry[] {
  return [
    ['speed', state.level],
    ['lamp', state.ambientLight ?? undefined],
  ];
}

function tank(state: VisualState): readonly SignalEntry[] {
  return [
    ['waterLevel', state.waterLevel ?? undefined],
    ['waterLow', state.waterLow],
  ];
}

function swing(state: VisualState): readonly SignalEntry[] {
  return [
    ['speed', state.level],
    ['oscillating', state.oscillating],
    ['swingAngle', state.angle ?? undefined],
  ];
}

function climate(state: VisualState): readonly SignalEntry[] {
  return [
    ['thermal', THERMAL[state.thermal]],
    ['target', state.target ?? undefined],
    ['current', state.current ?? undefined],
  ];
}

function diffuserEntries(facts: DiffuserFacts): readonly SignalEntry[] {
  return [
    ['charging', facts.charging],
    ['fault', facts.fault],
  ];
}

function microwavePhase(facts: MicrowaveFacts): string {
  return facts.finished && facts.phase === 'idle' ? 'finished' : facts.phase;
}

function microwaveEntries(facts: MicrowaveFacts): readonly SignalEntry[] {
  return [
    ['phase', microwavePhase(facts)],
    ['progress', facts.progress ?? undefined],
    ['door', facts.open ? 'open' : 'closed'],
    ['lamp', facts.lamp],
    ['locked', facts.locked],
    ['level', facts.power ?? undefined],
    ['mode', textOrUndefined(facts.mode)],
  ];
}

function laundryPhase(facts: LaundryFacts): string {
  if (facts.faultCode !== null) return 'fault';
  return !facts.running && isLaundryRunning(facts.phase) ? 'idle' : facts.phase;
}

function laundryDoor(facts: LaundryFacts): string {
  return facts.door === 'open' || facts.door === 'closed' ? facts.door : 'locked';
}

function drumSpeed(facts: LaundryFacts): number | null {
  return facts.motion === 'spin' ? facts.spin : null;
}

function laundryEntries(facts: LaundryFacts): readonly SignalEntry[] {
  return [
    ['phase', laundryPhase(facts)],
    ['door', laundryDoor(facts)],
    ['lamp', facts.drumLight],
    ['locked', facts.childLock],
    ['waterLevel', facts.water],
    ['progress', facts.progress ?? undefined],
    ['fault', facts.faultCode !== null],
    ['drumSpeed', drumSpeed(facts)],
  ];
}

const diffuserSignals: FamilySignals = (state) =>
  signals([
    ['speed', state.level],
    ['lamp', state.ambientLight ?? undefined],
    ['colour', hexOf(state.colour)],
    ...tank(state),
    ...(state.diffuser === undefined ? [] : diffuserEntries(state.diffuser)),
  ]);

const microwaveSignals: FamilySignals = (state) =>
  signals(state.microwave === undefined ? [] : microwaveEntries(state.microwave));

const laundrySignals: FamilySignals = (state) =>
  signals(state.laundry === undefined ? [] : laundryEntries(state.laundry));

const purifierSignals: FamilySignals = (state) =>
  signals([...airFlow(state), ['airQuality', state.band ?? undefined]]);

const humiditySignals: FamilySignals = (state) => signals([...airFlow(state), ...tank(state)]);

const fanSignals: FamilySignals = (state) => signals(swing(state));

const heaterSignals: FamilySignals = (state) =>
  signals([['speed', state.level], ...climate(state)]);

const conditionerSignals: FamilySignals = (state) => signals([...swing(state), ...climate(state)]);

const thermostatSignals: FamilySignals = (state) => signals(climate(state));

const lightSignals: FamilySignals = (state) =>
  signals([
    ['brightness', state.level],
    ['colour', hexOf(state.colour)],
  ]);

function fromEntries(entries: EntriesOf): FamilySignals {
  return (state) => signals(entries(state));
}

export const FAMILY_SIGNALS: Readonly<Partial<Record<DeviceFamily, FamilySignals>>> = {
  air_purifier: purifierSignals,
  humidifier: humiditySignals,
  diffuser: diffuserSignals,
  microwave: microwaveSignals,
  laundry: laundrySignals,
  dehumidifier: humiditySignals,
  tower_fan: fanSignals,
  fan: fanSignals,
  heater: heaterSignals,
  air_conditioner: conditionerSignals,
  thermostat: thermostatSignals,
  light: lightSignals,
  switch: fromEntries(socketEntries),
  plug: fromEntries(socketEntries),
  sensor: fromEntries(sensorEntries),
  button: fromEntries(buttonEntries),
  camera: fromEntries(cameraEntries),
  doorbell: fromEntries(doorbellEntries),
  scale: fromEntries(scaleEntries),
  wearable: fromEntries(wearableEntries),
  television: fromEntries(televisionEntries),
  speaker: fromEntries(speakerEntries),
  lock: fromEntries(lockEntries),
  cover: fromEntries(coverEntries),
  vacuum: fromEntries(vacuumEntries),
  ir_blaster: fromEntries(irBlasterEntries),
  ir_remote: fromEntries(irRemoteEntries),
  file_sync: fromEntries(fileSyncEntries),
  robot: fromEntries(robotEntries),
  treadmill: fromEntries(treadmillEntries),
  printer: fromEntries(printerEntries),
  bottle: fromEntries(bottleEntries),
  toothbrush: fromEntries(toothbrushEntries),
  phone: fromEntries(phoneEntries),
};

export function signalsOf(family: DeviceFamily, state: VisualState): ModelSignals {
  const own = FAMILY_SIGNALS[family];
  const shown = {
    ...signals([
      ['power', powerOf(state)],
      ['online', state.online],
    ]),
    ...(own === undefined ? {} : own(state)),
  };
  return state.online ? shown : { ...shown, power: false };
}
