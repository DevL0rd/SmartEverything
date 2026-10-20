import type { InputPortDecl } from '../automation-nodes/define';
import { SUMMARY_ABSENT, SUMMARY_CHIP_LIMIT } from '../automation-nodes/summary-template';
import type { JsonValue } from '../values';
import type { RefNames } from './describe-context';
import { plainWire, type WireScope } from './describe-wire';
import { humanizeKey } from '../presentation/humanize';
import type { PortValue } from './port-value';
import type { FlowType, RefKind } from './types';

const TARGET_KEYS = ['device', 'devices', 'room', 'group'] as const;

const TARGET_REF_KIND: Readonly<Record<(typeof TARGET_KEYS)[number], RefKind>> = {
  device: 'device',
  devices: 'device',
  room: 'room',
  group: 'group',
};

export function clipText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return SUMMARY_ABSENT;
  return flat.length > SUMMARY_CHIP_LIMIT ? `${flat.slice(0, SUMMARY_CHIP_LIMIT - 1)}…` : flat;
}

export function durationText(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (seconds < 60) return `${String(seconds)} s`;
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`;
  }
  const spare = minutes % 60;
  return spare === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(spare)} min`;
}

function idsOf(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') return [value];
  return isList(value) ? value.filter((item) => typeof item === 'string') : [];
}

function refText(of: RefKind, id: string, names: RefNames): string {
  return names(of, id) ?? `a removed ${of}`;
}

export function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function recordOf(value: JsonValue): Readonly<Record<string, JsonValue>> | undefined {
  return typeof value === 'object' && value !== null && !isList(value) ? value : undefined;
}

function targetText(value: JsonValue, names: RefNames): string {
  const record = recordOf(value) ?? {};
  const named = TARGET_KEYS.flatMap((key) =>
    idsOf(record[key]).map((id) => refText(TARGET_REF_KIND[key], id, names)),
  );
  const families = idsOf(record['families']).join(', ');
  const where = idsOf(record['room']).length > 0 && families !== '' ? ' in ' : '';
  if (families === '') return named.length === 0 ? 'a target' : named.join(' and ');
  return where === '' ? families : `${families}${where}${named.join(' and ')}`;
}

const LIST_SHOWN = 2;

function joinedNames(texts: readonly string[]): string {
  if (texts.length <= LIST_SHOWN + 1) return texts.join(', ');
  return `${texts.slice(0, LIST_SHOWN).join(', ')}, +${String(texts.length - LIST_SHOWN)}`;
}

function listText(of: FlowType | undefined, items: readonly JsonValue[], names: RefNames): string {
  return joinedNames(items.map((item) => literalText(of, item, names)));
}

const LOOSE_REF_KINDS: readonly RefKind[] = ['device', 'room', 'group'];

function knownName(value: string, names: RefNames): string | undefined {
  for (const kind of LOOSE_REF_KINDS) {
    const found = names(kind, value);
    if (found !== undefined) return found;
  }
  return undefined;
}

function looseRecordText(record: Readonly<Record<string, JsonValue>>, names: RefNames): string {
  if (TARGET_KEYS.some((key) => key in record)) return targetText(record, names);
  return Object.entries(record)
    .map(([key, item]) => `${humanizeKey(key)}: ${literalText(undefined, item, names)}`)
    .join(', ');
}

function looseText(value: JsonValue, names: RefNames): string {
  if (typeof value === 'string') return knownName(value, names) ?? value;
  if (isList(value)) return listText(undefined, value, names);
  const record = recordOf(value);
  return record === undefined ? plainLiteral(value) : looseRecordText(record, names);
}

function recordText(
  type: Extract<FlowType, { t: 'record' }>,
  record: Readonly<Record<string, JsonValue>>,
  names: RefNames,
): string {
  return Object.entries(record)
    .map(([key, item]) => literalText(type.fields?.[key] ?? type.values, item, names))
    .join(', ');
}

function plainLiteral(value: JsonValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return value === null ? 'nothing' : JSON.stringify(value);
}

function refValueText(type: FlowType, value: JsonValue, names: RefNames): string | undefined {
  if (type.t !== 'ref') return undefined;
  if (type.of === 'target') return targetText(value, names);
  return typeof value === 'string' ? refText(type.of, value, names) : undefined;
}

function collectionText(type: FlowType, value: JsonValue, names: RefNames): string | undefined {
  const record = recordOf(value);
  if (type.t === 'list' && isList(value)) return listText(type.of, value, names);
  return type.t === 'record' && record !== undefined ? recordText(type, record, names) : undefined;
}

function scalarText(type: FlowType, value: JsonValue): string | undefined {
  if (type.t === 'choice') return type.options.find((option) => option.id === value)?.label;
  return type.t === 'duration' && typeof value === 'number' ? durationText(value) : undefined;
}

export function literalText(type: FlowType | undefined, value: JsonValue, names: RefNames): string {
  if (type === undefined || type.t === 'any') return looseText(value, names);
  if (type.t === 'optional') return literalText(type.of, value, names);
  return (
    refValueText(type, value, names) ??
    collectionText(type, value, names) ??
    scalarText(type, value) ??
    plainLiteral(value)
  );
}

export function portText(
  port: PortValue | undefined,
  decl: Pick<InputPortDecl, 'type'> | undefined,
  names: RefNames,
  scope: WireScope,
): string {
  if (port === undefined) return SUMMARY_ABSENT;
  if ('lit' in port) return clipText(literalText(decl?.type, port.lit, names));
  return clipText(plainWire(port.wire, scope));
}
