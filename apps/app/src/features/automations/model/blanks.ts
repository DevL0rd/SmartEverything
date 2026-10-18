import {
  targetDevices,
  type AutomationValueRow,
  type ConditionV2,
  type DeviceTarget,
  type StepV2,
  type TargetV2,
  type TriggerV2,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import type { Catalog } from '../data/use-automations';
import { groupControlChoices } from '../../device-groups';
import {
  defaultValue,
  readableCapabilities,
  seedOf,
  testFor,
  writableCapabilities,
} from './capability-choices';
import { blankAudioChange, blankDisplayChange, computersOf } from './computer-steps';
import { defaultLiteral } from './inputs';
import type { Callable } from './reusable-steps';
import { blankSignal } from './signal-triggers';
import { SPEAK_TOOL, speechStep } from './speak-step';

export const TRIGGER_KINDS = [
  'time',
  'sun',
  'every',
  'device',
  'event',
  'weather',
  'signal',
  'speech',
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const CONDITION_KINDS = ['compare', 'time', 'daylight', 'any'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

const LEAF_KINDS = [
  'set',
  'scene',
  'wait',
  'notify',
  'ai',
  'tool',
  'speak',
  'audio',
  'display',
] as const;
const FLOW_KINDS = ['value', 'if', 'repeat', 'run', 'stop'] as const;
export const STEP_KINDS = [...LEAF_KINDS, ...FLOW_KINDS] as const;
export type StepKind = (typeof STEP_KINDS)[number];
type FlowKind = (typeof FLOW_KINDS)[number];
type LeafKind = (typeof LEAF_KINDS)[number];

function isFlowKind(kind: StepKind): kind is FlowKind {
  return FLOW_KINDS.some((flow) => flow === kind);
}
const WEEKDAYS_ONLY: readonly number[] = [1, 2, 3, 4, 5];
const DEFAULT_WAIT_MS = 60_000;
const DEFAULT_REPEAT_TIMES = 3;
const DEFAULT_REPEAT_LIMIT_MS = 60_000;

export function newId(): string {
  return randomUUID();
}

function blankDeviceTrigger(catalog: Catalog): TriggerV2 | null {
  for (const device of catalog.devices) {
    const capability = readableCapabilities(device)[0];
    if (capability === undefined) continue;
    const descriptor = capability.value;
    const operator =
      descriptor.kind === 'number' ? 'gt' : descriptor.kind === 'boolean' ? 'eq' : 'changed';
    return {
      on: 'signal',
      id: newId(),
      source: 'device',
      kind: 'state',
      subject: device.id,
      field: capability.key,
      test: testFor(operator, seedOf(descriptor)),
    };
  }
  return null;
}

export function blankTrigger(kind: TriggerKind, catalog: Catalog): TriggerV2 | null {
  const id = newId();
  switch (kind) {
    case 'time':
      return { on: 'time', id, at: '07:00' };
    case 'sun':
      return { on: 'sun', id, event: 'sunset' };
    case 'every':
      return { on: 'every', id, minutes: 60 };
    case 'device':
      return blankDeviceTrigger(catalog);
    case 'event':
      return { on: 'signal', id, source: 'event', kind: 'motion' };
    case 'weather':
      return {
        on: 'signal',
        id,
        source: 'weather',
        kind: 'forecast',
        field: 'temperature',
        test: { is: 'gt', to: 30 },
      };
    case 'signal': {
      const signal = blankSignal();
      return signal === null ? null : { ...signal, id };
    }
    case 'speech':
      return { on: 'speech', id, phrase: '' };
  }
}

function blankReading(catalog: Catalog): ConditionV2 | null {
  for (const device of catalog.devices) {
    const capability = readableCapabilities(device)[0];
    if (capability === undefined) continue;
    const descriptor = capability.value;
    const operator = descriptor.kind === 'number' ? 'gt' : 'eq';
    const test = testFor(operator, seedOf(descriptor));
    if (test.is === 'changed' || test.is === 'in') continue;
    return { compare: { device: device.id, control: capability.key }, test };
  }
  return null;
}

export function blankCondition(kind: ConditionKind, catalog: Catalog): ConditionV2 | null {
  switch (kind) {
    case 'compare':
      return blankReading(catalog);
    case 'time':
      return { time: { after: '22:00', before: '06:00' } };
    case 'daylight':
      return { daylight: 'night' };
    case 'any': {
      const first = blankReading(catalog);
      return { any: first === null ? [{ time: { days: [...WEEKDAYS_ONLY] } }] : [first] };
    }
  }
}

function deviceTargetOf(target: TargetV2): DeviceTarget {
  if ('device' in target) return { kind: 'devices', deviceIds: [target.device] };
  if ('devices' in target) return { kind: 'devices', deviceIds: target.devices };
  if ('group' in target) return { kind: 'group', groupId: target.group };
  return { kind: 'room', roomId: target.room };
}

export function targetControls(
  catalog: Catalog,
  target: TargetV2,
): ReturnType<typeof groupControlChoices> {
  if ('group' in target && !catalog.groups.some((group) => group.id === target.group)) return [];
  return groupControlChoices(
    targetDevices(catalog.allDevices, catalog.groups, deviceTargetOf(target)),
  );
}

function blankSet(catalog: Catalog): StepV2 | null {
  for (const device of catalog.devices) {
    const capability = writableCapabilities(device)[0];
    if (capability !== undefined)
      return {
        do: 'set',
        id: newId(),
        target: { device: device.id },
        control: capability.key,
        to: defaultValue(capability.value),
      };
  }
  return null;
}

export function runStepFor(callee: Callable): Extract<StepV2, { do: 'run' }> {
  const inputs = Object.fromEntries(
    callee.inputs.map((input) => [input.name, defaultLiteral(input.type)]),
  );
  return {
    do: 'run',
    id: newId(),
    automation: callee.id,
    wait: true,
    ...(callee.inputs.length === 0 ? {} : { inputs }),
  };
}

function blankRun(catalog: Catalog): StepV2 | null {
  const callee = catalog.callable[0];
  return callee === undefined ? null : runStepFor(callee);
}

export function valueStepFor(row: AutomationValueRow): Extract<StepV2, { do: 'value' }> {
  const content = row.content;
  const value = row.id;
  if (content.kind === 'boolean') return { do: 'value', id: newId(), value, op: 'toggle' };
  if (content.kind === 'choice') return { do: 'value', id: newId(), value, op: 'next' };
  return { do: 'value', id: newId(), value, op: 'set', amount: content.value };
}

function blankValueStep(catalog: Catalog): StepV2 | null {
  const row = catalog.values[0];
  return row === undefined ? null : valueStepFor(row);
}

function blankFlow(kind: FlowKind, catalog: Catalog): StepV2 | null {
  const id = newId();
  switch (kind) {
    case 'value':
      return blankValueStep(catalog);
    case 'if':
      return { do: 'if', id, branches: [{ id: newId(), when: { all: [] }, then: [] }] };
    case 'repeat':
      return {
        do: 'repeat',
        id,
        times: DEFAULT_REPEAT_TIMES,
        gapMs: 1000,
        limitMs: DEFAULT_REPEAT_LIMIT_MS,
        steps: [{ do: 'wait', id: newId(), ms: 1000 }],
      };
    case 'run':
      return blankRun(catalog);
    case 'stop':
      return { do: 'stop', id };
  }
}

function blankComputerStep(kind: 'audio' | 'display', catalog: Catalog): StepV2 | null {
  const computer = computersOf(catalog.devices)[0];
  if (computer === undefined) return null;
  const id = newId();
  return kind === 'audio'
    ? { do: kind, id, computer: computer.id, change: blankAudioChange('volume') }
    : { do: kind, id, computer: computer.id, change: blankDisplayChange('brightness') };
}

function blankOwnerStep(
  kind: 'ai' | 'tool' | 'speak',
  catalog: Catalog,
  id: string,
): StepV2 | null {
  const person = catalog.wakeProfileId;
  if (person === null) return null;
  if (kind === 'ai') return { do: 'ai', id, person, instruction: '' };
  if (kind === 'tool') return { do: 'tool', id, person, tool: '' };
  const speaker = catalog.speakers[0];
  return speaker === undefined
    ? null
    : speechStep({ do: 'tool', id, person, tool: SPEAK_TOOL }, { deviceId: speaker.id, text: '' });
}

function blankScene(catalog: Catalog, id: string): StepV2 | null {
  const scene = catalog.scenes[0];
  return scene === undefined ? null : { do: 'scene', id, scene: scene.id };
}

function blankLeaf(kind: LeafKind, catalog: Catalog): StepV2 | null {
  const id = newId();
  switch (kind) {
    case 'set':
      return blankSet(catalog);
    case 'scene':
      return blankScene(catalog, id);
    case 'wait':
      return { do: 'wait', id, ms: DEFAULT_WAIT_MS };
    case 'notify':
      return { do: 'notify', id, message: '' };
    case 'ai':
    case 'tool':
    case 'speak':
      return blankOwnerStep(kind, catalog, id);
    case 'audio':
    case 'display':
      return blankComputerStep(kind, catalog);
  }
}

export function blankStep(kind: StepKind, catalog: Catalog): StepV2 | null {
  return isFlowKind(kind) ? blankFlow(kind, catalog) : blankLeaf(kind, catalog);
}

const STEP_NEEDS: Readonly<Record<StepKind, (catalog: Catalog) => boolean>> = {
  set: (catalog) => catalog.devices.some((device) => writableCapabilities(device).length > 0),
  scene: (catalog) => catalog.scenes.length > 0,
  ai: (catalog) => catalog.wakeProfileId !== null,
  tool: (catalog) => catalog.wakeProfileId !== null,
  speak: (catalog) => catalog.wakeProfileId !== null && catalog.speakers.length > 0,
  audio: (catalog) => computersOf(catalog.devices).length > 0,
  display: (catalog) => computersOf(catalog.devices).length > 0,
  value: (catalog) => catalog.values.length > 0,
  run: (catalog) => catalog.callable.length > 0,
  wait: () => true,
  notify: () => true,
  if: () => true,
  repeat: () => true,
  stop: () => true,
};

export function stepAvailable(kind: StepKind, catalog: Catalog): boolean {
  return STEP_NEEDS[kind](catalog);
}

const TRIGGER_NEEDS: Readonly<Record<TriggerKind, (catalog: Catalog) => boolean>> = {
  device: (catalog) => catalog.devices.some((device) => readableCapabilities(device).length > 0),
  signal: () => blankSignal() !== null,
  time: () => true,
  sun: () => true,
  every: () => true,
  event: () => true,
  weather: () => true,
  speech: () => true,
};

export function triggerAvailable(kind: TriggerKind, catalog: Catalog): boolean {
  return TRIGGER_NEEDS[kind](catalog);
}
