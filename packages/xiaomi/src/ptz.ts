import {
  CommandRefusedError,
  catalogueEntryOf,
  type DeviceCapability,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ActionAddress, PropertyAddress, PropertyReading, PropertyWrite } from './miot';
import { standardName, type MiotService, type MiotSpec } from './spec';

export const MOTOR_MODELS: ReadonlySet<string> = new Set([
  'chuangmi.camera.ipc009',
  'chuangmi.camera.ipc013',
  'chuangmi.camera.ipc019',
  'chuangmi.camera.021a04',
  'chuangmi.camera.038a2',
]);

export const MOTOR_METHOD = 'set_motor';

export const MISS_MOTOR_PATH = '/api/xiaomi/motor';

export const PTZ_DIRECTIONS = ['up', 'down', 'left', 'right', 'home'] as const;

export type PtzDirection = (typeof PTZ_DIRECTIONS)[number];

export type MotorOperation = 1 | 2 | 3 | 4 | 5;

export const MOTOR_OPERATIONS: Readonly<Record<PtzDirection, MotorOperation>> = {
  left: 1,
  right: 2,
  up: 3,
  down: 4,
  home: 5,
};

export type PtzMoves =
  | { readonly kind: 'miio' }
  | { readonly kind: 'miss' }
  | { readonly kind: 'none'; readonly reason: string };

export interface PresetSlots {
  readonly list: PropertyAddress;
  readonly active: PropertyAddress;
  readonly min: number;
  readonly max: number;
}

export interface PtzPlan {
  readonly moves: PtzMoves;
  readonly calibrate: ActionAddress | null;
  readonly presets: PresetSlots | null;
  readonly cruise: boolean;
}

export interface PtzPosition {
  readonly index: number;
  readonly label: string;
}

export interface PtzPositions {
  readonly positions: readonly PtzPosition[];
  readonly malformed: readonly string[];
}

export type PtzStep =
  | { readonly kind: 'miio'; readonly method: string; readonly params: JsonValue }
  | { readonly kind: 'action'; readonly action: ActionAddress }
  | { readonly kind: 'motor'; readonly operation: MotorOperation };

function servicesNamed(spec: MiotSpec, name: string): MiotService[] {
  return spec.services.filter((service) => standardName(service.type) === name);
}

function calibrateOf(spec: MiotSpec): ActionAddress | null {
  for (const service of servicesNamed(spec, 'camera-control')) {
    const action = service.actions.find((entry) => standardName(entry.type) === 'ptz-calibrate');
    if (action !== undefined) {
      return { siid: service.iid, aiid: action.iid };
    }
  }
  return null;
}

function presetsOf(spec: MiotSpec): PresetSlots | null {
  const [service] = servicesNamed(spec, 'camera-fav-area');
  if (service === undefined) {
    return null;
  }
  const property = (name: string): MiotService['properties'][number] | undefined =>
    service.properties.find((entry) => standardName(entry.type) === name);
  const list = property('fav-area');
  const active = property('active-fav-area');
  if (list === undefined || active?.['value-range'] === undefined) {
    return null;
  }
  const [min, max] = active['value-range'];
  return {
    list: { siid: service.iid, piid: list.iid },
    active: { siid: service.iid, piid: active.iid },
    min,
    max,
  };
}

export const NO_MOTOR = 'the camera has no pan and tilt motor';

function movesOf(model: string, motorised: boolean): PtzMoves {
  if (MOTOR_MODELS.has(model)) {
    return { kind: 'miio' };
  }
  return motorised ? { kind: 'miss' } : { kind: 'none', reason: NO_MOTOR };
}

export function ptzPlan(spec: MiotSpec, model: string): PtzPlan {
  const calibrate = calibrateOf(spec);
  const presets = presetsOf(spec);
  const cruise = servicesNamed(spec, 'cruise').length > 0;
  const motorised = calibrate !== null || presets !== null || cruise;
  return { moves: movesOf(model, motorised), calibrate, presets, cruise };
}

export function hasMotor(plan: PtzPlan): boolean {
  return (
    plan.moves.kind !== 'none' || plan.cruise || plan.calibrate !== null || plan.presets !== null
  );
}

export function missUnreachable(plan: PtzPlan, reason: string): PtzPlan {
  return plan.moves.kind === 'miss' ? { ...plan, moves: { kind: 'none', reason } } : plan;
}

const SAVED_POSITION = z.object({ idx: z.number().int(), name: z.string().optional() });

type SavedEntries = { readonly entries: readonly unknown[] } | { readonly problem: string };

function savedEntries(raw: JsonValue): SavedEntries {
  if (typeof raw !== 'string') {
    return { problem: `fav-area is ${JSON.stringify(raw)}, expected JSON text` };
  }
  if (raw.trim() === '') {
    return { entries: [] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? { entries: parsed }
      : { problem: `fav-area is ${raw}, expected a JSON list` };
  } catch (cause) {
    return { problem: `fav-area is not JSON (${String(cause)})` };
  }
}

function labelled(
  entries: readonly { readonly idx: number; readonly name: string }[],
): PtzPosition[] {
  const positions: PtzPosition[] = [];
  for (const { idx, name } of entries) {
    const label = name === '' ? `Position ${String(idx)}` : name;
    const taken = positions.some((position) => position.label === label);
    positions.push({ index: idx, label: taken ? `${label} (${String(idx)})` : label });
  }
  return positions;
}

export function parsePositions(raw: JsonValue, slots: PresetSlots): PtzPositions {
  const saved = savedEntries(raw);
  if ('problem' in saved) {
    return { positions: [], malformed: [saved.problem] };
  }
  const valid: { readonly idx: number; readonly name: string }[] = [];
  const malformed: string[] = [];
  for (const entry of saved.entries) {
    const parsed = SAVED_POSITION.safeParse(entry);
    if (parsed.success && parsed.data.idx >= slots.min && parsed.data.idx <= slots.max) {
      valid.push({ idx: parsed.data.idx, name: (parsed.data.name ?? '').trim() });
    } else {
      malformed.push(
        `${JSON.stringify(entry)} is not a saved position with idx ${String(slots.min)} to ${String(slots.max)}`,
      );
    }
  }
  return { positions: labelled(valid), malformed };
}

export function positionsReading(plan: PtzPlan, reading: PropertyReading): PtzPositions | null {
  const slots = plan.presets;
  if (
    slots === null ||
    !reading.ok ||
    reading.siid !== slots.list.siid ||
    reading.piid !== slots.list.piid
  ) {
    return null;
  }
  return parsePositions(reading.value, slots);
}

export function ptzCapabilities(
  plan: PtzPlan,
  positions: readonly PtzPosition[],
): DeviceCapability[] {
  const capabilities: DeviceCapability[] = [];
  if (plan.moves.kind !== 'none') {
    capabilities.push({
      key: 'ptz',
      label: catalogueEntryOf('ptz').label,
      access: 'write',
      value: { kind: 'action', arguments: ['direction'] },
    });
  }
  if (plan.presets !== null && positions.length > 0) {
    capabilities.push({
      key: 'ptz_preset',
      label: catalogueEntryOf('ptz_preset').label,
      access: 'write',
      value: { kind: 'enum', options: positions.map(({ label }) => label) },
    });
  }
  return capabilities;
}

const PTZ_ARGUMENTS = z.object({ direction: z.enum(PTZ_DIRECTIONS) });

export function ptzStep(plan: PtzPlan, model: string, value: JsonValue): PtzStep {
  const parsed = PTZ_ARGUMENTS.safeParse(value);
  if (!parsed.success) {
    throw new CommandRefusedError(
      'ptz',
      `the direction must be one of ${PTZ_DIRECTIONS.join(', ')}`,
    );
  }
  const { direction } = parsed.data;
  const { moves } = plan;
  if (moves.kind === 'miss') {
    return { kind: 'motor', operation: MOTOR_OPERATIONS[direction] };
  }
  if (direction === 'home') {
    if (plan.calibrate === null) {
      throw new CommandRefusedError(
        'ptz',
        `${model} has no MIoT ptz-calibrate action to return home`,
      );
    }
    return { kind: 'action', action: plan.calibrate };
  }
  if (moves.kind === 'none') {
    throw new CommandRefusedError('ptz', `${model} cannot move: ${moves.reason}`);
  }
  return {
    kind: 'miio',
    method: MOTOR_METHOD,
    params: { operation: MOTOR_OPERATIONS[direction] },
  };
}

export function presetWrite(
  plan: PtzPlan,
  positions: readonly PtzPosition[],
  value: JsonValue,
): PropertyWrite {
  const slots = plan.presets;
  if (slots === null) {
    throw new CommandRefusedError('ptz_preset', 'the camera has no MIoT camera-fav-area service');
  }
  const position = positions.find(({ label }) => label === value);
  if (position === undefined) {
    throw new CommandRefusedError(
      'ptz_preset',
      `no saved position is named ${JSON.stringify(value)}`,
    );
  }
  return { ...slots.active, value: position.index };
}

function address(siid: number, iid: number): string {
  return `${String(siid)}.${String(iid)}`;
}

const MISS_MOTOR = `MISS command 0x112 through go2rtc ${MISS_MOTOR_PATH}`;

function describeMoves(moves: PtzMoves): string {
  switch (moves.kind) {
    case 'miio':
      return `miIO ${MOTOR_METHOD}`;
    case 'miss':
      return MISS_MOTOR;
    case 'none':
      return `none: ${moves.reason}`;
  }
}

function describeHome(plan: PtzPlan): string {
  if (plan.moves.kind === 'miss') {
    return `${MISS_MOTOR} operation ${String(MOTOR_OPERATIONS.home)}`;
  }
  return plan.calibrate === null
    ? 'none'
    : `MIoT action ${address(plan.calibrate.siid, plan.calibrate.aiid)} ptz-calibrate`;
}

export function describePtz(plan: PtzPlan): string {
  const moves = describeMoves(plan.moves);
  const home = describeHome(plan);
  const presets =
    plan.presets === null
      ? 'none'
      : `MIoT property ${address(plan.presets.active.siid, plan.presets.active.piid)} active-fav-area`;
  return `moves: ${moves}; home: ${home}; presets: ${presets}`;
}

export function cloudRpc(
  did: string,
  method: string,
  params: JsonValue,
): { readonly path: string; readonly data: JsonValue } {
  return { path: `/home/rpc/${encodeURIComponent(did)}`, data: { method, params } };
}
