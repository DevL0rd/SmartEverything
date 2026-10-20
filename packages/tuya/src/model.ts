import {
  CommandRefusedError,
  HSV_COLOR,
  catalogueEntryOf,
  checkValue,
  humanizeKey,
  isRawCapability,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceKind,
  type JsonValue,
  type ValueDescriptor,
} from '@smarteverything/domain';
import { CAPABILITY_RULES, type CapabilityRule, type Codec } from './capability-rules';
import { kindOf } from './categories';
import { decodeColor, encodeColor, type Transport } from './color';
import type { DataPoint, DataPointShape } from './data-points';
import { irSchemeOf, type DataPointRef, type DataPointWrite, type IrScheme } from './ir-scheme';
import { DataPointValueError, descriptorOf, fromDevice, toDevice } from './values';

export interface CapabilityBinding {
  readonly capability: DeviceCapability;
  readonly read: DataPoint | null;
  readonly write: DataPoint | null;
  readonly codec: Codec;
}

export interface DeviceModel {
  readonly kind: DeviceKind;
  readonly capabilities: readonly DeviceCapability[];
  readonly bindings: readonly CapabilityBinding[];
  readonly points: readonly DataPoint[];
  readonly ir: IrScheme | null;
}

export const IR_CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'ir_learn', label: 'Learn IR code', access: 'write', value: { kind: 'action' } },
  {
    key: 'ir_send',
    label: 'Send IR code',
    access: 'write',
    value: { kind: 'action', arguments: ['format', 'code'] },
  },
];

const DIRECT: Codec = { kind: 'direct' };

function descriptorFor(codec: Codec, shape: DataPointShape): ValueDescriptor {
  switch (codec.kind) {
    case 'direct':
      return descriptorOf(shape);
    case 'flag':
      return { kind: 'boolean' };
    case 'color':
      return { kind: 'color' };
    case 'trigger':
      return { kind: 'action' };
  }
}

function fits(codec: Codec, point: DataPoint): boolean {
  switch (codec.kind) {
    case 'direct':
      return true;
    case 'flag':
      return point.shape.type === 'Enum';
    case 'color':
      return point.shape.type === 'Json' || point.shape.type === 'String';
    case 'trigger':
      return point.shape.type === 'Boolean' && point.writable;
  }
}

function accessOf(read: DataPoint | null, write: DataPoint | null): DeviceCapability['access'] {
  if (read !== null && write !== null) {
    return 'read_write';
  }
  return read === null ? 'write' : 'read';
}

function binding(
  key: CapabilityKey,
  label: string,
  codec: Codec,
  points: { readonly point: DataPoint; readonly status: DataPoint | undefined },
): CapabilityBinding {
  const read =
    codec.kind === 'trigger'
      ? null
      : (points.status ?? (points.point.readable ? points.point : null));
  const write = codec.kind === 'flag' || !points.point.writable ? null : points.point;
  return {
    capability: {
      key,
      label,
      access: accessOf(read, write),
      value: descriptorFor(codec, points.point.shape),
    },
    read,
    write,
    codec,
  };
}

function claim(rule: CapabilityRule, available: readonly DataPoint[]): CapabilityBinding | null {
  const codec = rule.codec ?? DIRECT;
  const wanted = catalogueEntryOf(rule.capability).kind;
  const point = rule.codes
    .map((code) => available.find((candidate) => candidate.code === code))
    .find(
      (candidate): candidate is DataPoint =>
        candidate !== undefined &&
        fits(codec, candidate) &&
        descriptorFor(codec, candidate.shape).kind === wanted,
    );
  if (point === undefined) {
    return null;
  }
  const statusCodes = rule.statusCodes;
  const status =
    statusCodes === undefined
      ? undefined
      : available.find((candidate) => statusCodes.includes(candidate.code));
  return binding(rule.capability, catalogueEntryOf(rule.capability).label, codec, {
    point,
    status,
  });
}

function rawKey(point: DataPoint, used: ReadonlySet<string>): CapabilityKey {
  const candidate = `raw:${point.code.toLowerCase().replaceAll(/[^a-z0-9_.:-]/g, '_')}`;
  if (isRawCapability(candidate) && !used.has(candidate)) {
    return candidate;
  }
  return point.dpId === null ? `raw:code_${String(used.size)}` : `raw:dp_${String(point.dpId)}`;
}

function standardBindings(category: string, points: readonly DataPoint[]): CapabilityBinding[] {
  const bindings: CapabilityBinding[] = [];
  for (const rule of CAPABILITY_RULES) {
    const applies = rule.categories === undefined || rule.categories.includes(category);
    const bound = bindings.some((existing) => existing.capability.key === rule.capability);
    const claimed = new Set(
      bindings.flatMap((existing) => [existing.read?.code, existing.write?.code]),
    );
    const result =
      applies && !bound
        ? claim(
            rule,
            points.filter((point) => !claimed.has(point.code)),
          )
        : null;
    if (result !== null) {
      bindings.push(result);
    }
  }
  return bindings;
}

function irRefs(scheme: IrScheme): readonly DataPointRef[] {
  return scheme.kind === 'dp201'
    ? [scheme.send, scheme.learned]
    : [scheme.control, scheme.learned, scheme.head, scheme.key, scheme.study, scheme.codeType];
}

export function buildDeviceModel(
  category: string,
  points: readonly DataPoint[],
  observedDpIds: ReadonlySet<number>,
): DeviceModel {
  const kind = kindOf(category);
  const ir = kind === 'ir_blaster' ? irSchemeOf(points, observedDpIds) : null;
  const reserved = ir === null ? new Set<number>() : new Set(irRefs(ir).map((ref) => ref.dpId));
  const bindings = standardBindings(category, points);
  const claimed = new Set(
    bindings.flatMap((existing) => [existing.read?.code, existing.write?.code]),
  );
  const used = new Set<string>();
  for (const point of points.filter(
    (candidate) =>
      !claimed.has(candidate.code) && (candidate.dpId === null || !reserved.has(candidate.dpId)),
  )) {
    const key = rawKey(point, used);
    used.add(key);
    bindings.push(
      binding(key, point.name ?? humanizeKey(point.code), DIRECT, { point, status: undefined }),
    );
  }
  const capabilities = bindings.map((existing) => existing.capability);
  return {
    kind,
    capabilities: kind === 'ir_blaster' ? [...capabilities, ...IR_CAPABILITIES] : capabilities,
    bindings,
    points,
    ir,
  };
}

export interface ReportedValue {
  readonly code: string;
  readonly value: unknown;
}

export interface DecodedValue {
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
}

export interface DecodeProblem {
  readonly code: string;
  readonly error: unknown;
}

export interface DecodedReport {
  readonly values: readonly DecodedValue[];
  readonly problems: readonly DecodeProblem[];
}

function decodeWith(item: CapabilityBinding, point: DataPoint, raw: unknown): JsonValue {
  if (item.codec.kind === 'flag') {
    if (typeof raw !== 'string') {
      throw new DataPointValueError(point.code, 'one of its options', raw);
    }
    return item.codec.on.includes(raw);
  }
  if (item.codec.kind === 'color') {
    return decodeColor(item.codec.version, raw);
  }
  return fromDevice(point, raw);
}

export function decodeReport(model: DeviceModel, report: readonly ReportedValue[]): DecodedReport {
  const values: DecodedValue[] = [];
  const problems: DecodeProblem[] = [];
  for (const reported of report) {
    for (const item of model.bindings) {
      if (item.read?.code === reported.code) {
        try {
          values.push({
            capability: item.capability.key,
            value: decodeWith(item, item.read, reported.value),
          });
        } catch (error) {
          problems.push({ code: reported.code, error });
        }
      }
    }
  }
  return { values, problems };
}

function encodeWith(
  item: CapabilityBinding,
  point: DataPoint,
  value: unknown,
  transport: Transport,
): JsonValue {
  if (item.codec.kind === 'color') {
    return encodeColor(
      item.codec.version,
      HSV_COLOR.parse(checkValue({ kind: 'color' }, value)),
      transport,
    );
  }
  if (item.codec.kind === 'trigger') {
    checkValue({ kind: 'action' }, value);
    return true;
  }
  return toDevice(point, value);
}

export function encodeCommand(
  model: DeviceModel,
  capability: CapabilityKey,
  value: unknown,
  transport: Transport,
): readonly DataPointWrite[] {
  const item = model.bindings.find((candidate) => candidate.capability.key === capability);
  if (item === undefined) {
    throw new CommandRefusedError(
      capability,
      capability === 'ir_learn' || capability === 'ir_send'
        ? 'it is carried out by the infrared controller, not written as a data point'
        : 'the device does not have it',
    );
  }
  if (item.write === null) {
    throw new CommandRefusedError(capability, 'it can only be read');
  }
  return [
    {
      code: item.write.code,
      dpId: item.write.dpId,
      value: encodeWith(item, item.write, value, transport),
    },
  ];
}
