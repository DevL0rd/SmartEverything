import { presentDevice } from './capability-presentation';
import { CAMERA_DETECTION_PRESENTATIONS, EVENT_KIND_LABELS, eventKeywords } from './event-labels';
import { EVENT_KINDS } from './events';
import { pluginSignalSource, type PluginId } from './plugins';
import { humanizeEnum } from './presentation/humanize';
import type {
  DeviceFamily,
  PresentableDeviceWithCapabilities,
  PresentationTier,
  PresentedCapability,
} from './presentation/types';
import type { SignalKindSpec, SignalSourceSpec, SignalStatesSpec } from './signal-sources/spec';
import { signalKey } from './signals';
import {
  TRIGGER_GROUPS,
  TRIGGER_GROUP_LABELS,
  deviceGroup,
  sourceGroup,
  type TriggerGroup,
} from './trigger-groups';

export interface CatalogueNamed {
  readonly id: string;
  readonly name: string;
}

export interface CatalogueDevice extends PresentableDeviceWithCapabilities {
  readonly id: string;
  readonly name: string;
  readonly roomId: string | null;
}

export interface CatalogueInventory {
  readonly devices: readonly CatalogueDevice[];
  readonly rooms: readonly CatalogueNamed[];
  readonly people: readonly CatalogueNamed[];
  readonly chats: readonly CatalogueNamed[];
}

export interface CataloguePlugin {
  readonly id: PluginId;
  readonly name: string;
}

export const TRIGGER_HOWS = [
  'happens',
  'changes',
  'becomes',
  'rises_above',
  'falls_below',
  'stays',
  'times_in',
  'first',
  'quiet',
] as const;

export type TriggerHow = (typeof TRIGGER_HOWS)[number];

export const TRIGGER_HOW_LABELS: Readonly<Record<TriggerHow, string>> = {
  happens: 'Every time it happens',
  changes: 'Changes',
  becomes: 'Becomes',
  rises_above: 'Rises above',
  falls_below: 'Falls below',
  stays: 'Stays that way for',
  times_in: 'Happens a number of times in',
  first: 'First time',
  quiet: 'Goes quiet for',
};

export interface TriggerMatchChoice {
  readonly value: string;
  readonly label: string;
}

export interface TriggerMatchKey {
  readonly key: string;
  readonly label: string;
  readonly values: readonly TriggerMatchChoice[] | null;
}

export interface TriggerField {
  readonly field: string;
  readonly label: string;
  readonly unit: string | null;
}

export interface TriggerRow {
  readonly id: string;
  readonly source: string;
  readonly sourceLabel: string;
  readonly kind: string;
  readonly subject: string | null;
  readonly field: string | null;
  readonly group: TriggerGroup;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly hows: readonly TriggerHow[];
  readonly states: SignalStatesSpec | null;
  readonly pulse: boolean;
  readonly fields: readonly TriggerField[];
  readonly match: readonly TriggerMatchKey[];
  readonly room: string | null;
  readonly roomId: string | null;
}

export interface TriggerLookup {
  readonly sources: readonly SignalSourceSpec[];
  readonly inventory: CatalogueInventory;
  readonly devices: ReadonlyMap<string, CatalogueDevice>;
}

export interface TriggerCatalogue extends TriggerLookup {
  readonly rows: readonly TriggerRow[];
}

export function triggerLookup(
  sources: readonly SignalSourceSpec[],
  inventory: CatalogueInventory,
): TriggerLookup {
  return {
    sources,
    inventory,
    devices: new Map(inventory.devices.map((device) => [device.id, device])),
  };
}

const UNPICKABLE_TIERS: ReadonlySet<PresentationTier> = new Set(['hidden', 'diagnostic']);

function numericKind(spec: SignalKindSpec): boolean {
  return (
    !spec.pulse &&
    spec.states === undefined &&
    typeof spec.fields !== 'string' &&
    spec.fields.some((field) => field.unit !== null)
  );
}

const PULSE_HOWS: readonly TriggerHow[] = ['happens', 'times_in', 'first', 'quiet'];
const VALUE_HOWS: readonly TriggerHow[] = [
  'changes',
  'becomes',
  'stays',
  'times_in',
  'first',
  'quiet',
];
const NUMBER_HOWS: readonly TriggerHow[] = [
  'changes',
  'becomes',
  'rises_above',
  'falls_below',
  'stays',
  'times_in',
  'first',
  'quiet',
];

function howsOf(pulse: boolean, numeric: boolean): readonly TriggerHow[] {
  if (pulse) return PULSE_HOWS;
  return numeric ? NUMBER_HOWS : VALUE_HOWS;
}

function matchKeysOf(spec: SignalKindSpec): readonly TriggerMatchKey[] {
  return spec.match.map((entry) => ({
    key: entry.key,
    label: entry.label,
    values:
      entry.values === null
        ? null
        : entry.values.map((value) => ({
            value,
            label: entry.valueLabels?.[value] ?? humanizeEnum(value),
          })),
  }));
}

function fieldsOf(spec: SignalKindSpec): readonly TriggerField[] {
  return typeof spec.fields === 'string' ? [] : spec.fields;
}

function detectionWords(spec: SignalKindSpec): readonly string[] {
  const detection = spec.match.find((entry) => entry.key === 'detection');
  return (detection?.values ?? []).flatMap((value) => {
    const presentation = Object.entries(CAMERA_DETECTION_PRESENTATIONS).find(
      ([name]) => name === value,
    )?.[1];
    return presentation === undefined ? [] : [presentation.label, ...presentation.keywords];
  });
}

function eventWords(source: string, spec: SignalKindSpec): readonly string[] {
  const eventKind = source === 'event' ? EVENT_KINDS.find((kind) => kind === spec.kind) : undefined;
  return eventKind === undefined
    ? []
    : [EVENT_KIND_LABELS[eventKind], ...eventKeywords(eventKind, {}), ...detectionWords(spec)];
}

function wordsOf(parts: readonly (string | null | undefined)[]): readonly string[] {
  return [
    ...new Set(parts.filter((part): part is string => part !== null && part !== undefined)),
  ].filter((part) => part !== '');
}

interface RowBase {
  readonly source: string;
  readonly sourceLabel: string;
  readonly spec: SignalKindSpec;
  readonly pluginName: string | null;
}

function specRow(base: RowBase): TriggerRow {
  const { source, sourceLabel, spec, pluginName } = base;
  const fields = fieldsOf(spec);
  const group = sourceGroup(source, spec.kind);
  const matchKeys = matchKeysOf(spec);
  return {
    id: signalKey({ source, kind: spec.kind, subject: null, field: null }),
    source,
    sourceLabel,
    kind: spec.kind,
    subject: null,
    field: null,
    group,
    label: spec.label,
    keywords: wordsOf([
      source,
      sourceLabel,
      pluginName,
      spec.kind,
      spec.label,
      TRIGGER_GROUP_LABELS[group],
      ...fields.map((field) => field.label),
      ...matchKeys.flatMap((entry) => [
        entry.label,
        ...(entry.values ?? []).map((choice) => choice.label),
      ]),
      ...eventWords(source, spec),
    ]),
    hows: howsOf(spec.pulse, numericKind(spec)),
    states: spec.states ?? null,
    pulse: spec.pulse,
    fields,
    match: matchKeys,
    room: null,
    roomId: null,
  };
}

function readable(presented: PresentedCapability): boolean {
  return (
    !UNPICKABLE_TIERS.has(presented.tier) &&
    presented.capability.access !== 'write' &&
    presented.capability.value.kind !== 'action'
  );
}

function capabilityStates(presented: PresentedCapability): SignalStatesSpec | null {
  if (presented.capability.value.kind !== 'boolean') return null;
  const [on, off] = presented.states ?? ['on', 'off'];
  return { on, off };
}

interface DeviceRowParts {
  readonly device: CatalogueDevice;
  readonly roomName: string | null;
  readonly presented: PresentedCapability;
  readonly family: DeviceFamily;
}

function deviceRow(base: RowBase, parts: DeviceRowParts): TriggerRow {
  const { source, sourceLabel, spec } = base;
  const { device, roomName, presented, family } = parts;
  const label = `${device.name} ${presented.label}`;
  const states = capabilityStates(presented);
  const group = deviceGroup(family);
  return {
    id: signalKey({ source, kind: spec.kind, subject: device.id, field: presented.key }),
    source,
    sourceLabel,
    kind: spec.kind,
    subject: device.id,
    field: presented.key,
    group,
    label,
    keywords: wordsOf([
      device.name,
      roomName,
      humanizeEnum(family),
      humanizeEnum(device.kind),
      device.model,
      presented.label,
      presented.role === null ? null : humanizeEnum(presented.role),
      presented.groupLabel,
      TRIGGER_GROUP_LABELS[group],
      ...(presented.keywords ?? []),
      ...presented.options.map((option) => option.label),
    ]),
    hows: howsOf(false, presented.capability.value.kind === 'number'),
    states,
    pulse: false,
    fields: [{ field: presented.key, label: presented.label, unit: presented.unit }],
    match: matchKeysOf(spec),
    room: roomName,
    roomId: device.roomId,
  };
}

function deviceRows(
  base: RowBase,
  inventory: CatalogueInventory,
  roomNames: ReadonlyMap<string, string>,
): readonly TriggerRow[] {
  return inventory.devices.flatMap((device) => {
    const presentation = presentDevice(device);
    const roomName = device.roomId === null ? null : (roomNames.get(device.roomId) ?? null);
    return presentation.capabilities
      .filter(readable)
      .map((presented) =>
        deviceRow(base, { device, roomName, presented, family: presentation.family }),
      );
  });
}

function rowsOfKind(
  base: RowBase,
  inventory: CatalogueInventory,
  roomNames: ReadonlyMap<string, string>,
): readonly TriggerRow[] {
  return base.spec.fields === 'capabilities' && !base.spec.pulse
    ? [specRow(base), ...deviceRows(base, inventory, roomNames)]
    : [specRow(base)];
}

function byGroupThenLabel(left: TriggerRow, right: TriggerRow): number {
  return (
    TRIGGER_GROUPS.indexOf(left.group) - TRIGGER_GROUPS.indexOf(right.group) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

export function triggerCatalogue(
  sources: readonly SignalSourceSpec[],
  inventory: CatalogueInventory,
  plugins: readonly CataloguePlugin[],
): TriggerCatalogue {
  const roomNames = new Map(inventory.rooms.map((room) => [room.id, room.name]));
  const pluginNames = new Map(
    plugins.map((plugin) => [pluginSignalSource(plugin.id), plugin.name]),
  );
  const rows = sources
    .flatMap((source) =>
      source.kinds.flatMap((spec) => {
        const pluginName = pluginNames.get(source.source) ?? null;
        return rowsOfKind(
          { source: source.source, sourceLabel: pluginName ?? source.label, spec, pluginName },
          inventory,
          roomNames,
        );
      }),
    )
    .sort(byGroupThenLabel);
  return { ...triggerLookup(sources, inventory), rows };
}
