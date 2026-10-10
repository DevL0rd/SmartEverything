import {
  CAPABILITY_CATALOGUE,
  DISCOVERED_DEVICE,
  type CapabilityKey,
  type DiscoveredDevice,
  type RawCapability,
  type JsonValue,
} from '@smarteverything/domain';
import { inComponent, type Binding, type SmartThingsCommand } from './bindings';
import { definitionKey, type CapabilityDefinition } from './definition-schema';
import { deviceKindOf } from './device-kind';
import { SmartThingsResponseError } from './errors';
import { componentLabel, humanize, rawAttributeKey, standardKeyFor } from './keys';
import {
  attributeValue,
  stringList,
  type CapabilityMapper,
  type ComponentView,
  type StandardMapping,
} from './mapper-kit';
import { allMappers } from './mappers';
import { rawFromDefinition, rawFromStatus } from './raw-bindings';
import type { Component, ComponentStatus, Device, DeviceStatus } from './rest-schemas';

export const IGNORED_CAPABILITIES: ReadonlySet<string> = new Set([
  'actuator',
  'sensor',
  'healthCheck',
  'ocf',
  'execute',
  'configuration',
  'polling',
  'custom.disabledCapabilities',
]);

const NOTHING: ReadonlySet<string> = new Set();

export interface MappingContext {
  readonly rooms: ReadonlyMap<string | null | undefined, string>;
  readonly definitions: ReadonlyMap<string, CapabilityDefinition>;
}

export interface MappedDevice {
  readonly device: DiscoveredDevice;
  readonly bindings: readonly Binding[];
  readonly status: DeviceStatus['components'];
}

interface ComponentResult {
  readonly bindings: readonly Binding[];
  readonly unresolved: readonly string[];
}

export function statusOfComponent(component: Component): ComponentStatus {
  return Object.fromEntries(
    component.capabilities.flatMap((reference) =>
      reference.status === undefined || reference.status === null
        ? []
        : [[reference.id, reference.status]],
    ),
  );
}

type CapabilityReference = Component['capabilities'][number];

function activeCapabilities(
  component: Component,
  status: ComponentStatus,
): readonly CapabilityReference[] {
  const disabled = stringList(
    attributeValue(status, 'custom.disabledCapabilities', 'disabledCapabilities'),
  );
  return component.capabilities.filter(
    (reference) => !IGNORED_CAPABILITIES.has(reference.id) && !disabled.includes(reference.id),
  );
}

function uniqueRawKey(key: RawCapability, taken: Set<string>): RawCapability {
  let candidate = key;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    candidate = `${key}_${String(suffix)}`;
  }
  taken.add(candidate);
  return candidate;
}

function claimStandardKey(preferred: CapabilityKey, taken: Set<string>): boolean {
  if (taken.has(preferred)) {
    return false;
  }
  taken.add(preferred);
  return true;
}

function standardBinding(
  component: Component,
  mapper: CapabilityMapper,
  mapping: StandardMapping,
  taken: Set<string>,
): Binding {
  const preferred = standardKeyFor(component.id, mapping.key);
  const catalogue = CAPABILITY_CATALOGUE[mapping.key].label;
  const claimed = claimStandardKey(preferred, taken);
  const key = claimed
    ? preferred
    : uniqueRawKey(rawAttributeKey(component.id, mapper.capability, mapping.key), taken);
  const label = claimed ? catalogue : `${catalogue} (${humanize(mapper.capability).toLowerCase()})`;
  const { write } = mapping;
  return {
    capability: {
      key,
      label: componentLabel(component.id, label, component.label ?? null),
      access: mapping.access,
      value: mapping.value,
    },
    component: component.id,
    sources: mapping.sources,
    read: mapping.read,
    write:
      write === null
        ? null
        : (value: JsonValue): readonly SmartThingsCommand[] =>
            inComponent(component.id, write(value)),
  };
}

interface ComponentWork {
  readonly component: Component;
  readonly status: ComponentStatus;
  readonly taken: Set<string>;
  readonly bindings: Binding[];
  readonly covered: Map<string, CapabilityMapper>;
}

function addStandard(work: ComponentWork, view: ComponentView): void {
  for (const mapper of allMappers().filter((entry) => view.capabilities.has(entry.capability))) {
    const mappings = mapper.map(view);
    if (mappings.length > 0) {
      work.covered.set(mapper.capability, mapper);
    }
    work.bindings.push(
      ...mappings.map((mapping) => standardBinding(work.component, mapper, mapping, work.taken)),
    );
  }
}

function addRaw(
  work: ComponentWork,
  reference: CapabilityReference,
  definition: CapabilityDefinition | undefined,
): void {
  const { component, status, taken } = work;
  const mapper = work.covered.get(reference.id);
  const rawContext = {
    component: component.id,
    capability: reference.id,
    status,
    coveredAttributes: mapper === undefined ? NOTHING : new Set(mapper.attributes),
    coveredCommands: mapper === undefined ? NOTHING : new Set(mapper.commands),
  };
  const raw =
    definition === undefined
      ? rawFromStatus(rawContext)
      : rawFromDefinition(rawContext, definition);
  work.bindings.push(
    ...raw.map((binding) => ({
      ...binding,
      capability: {
        ...binding.capability,
        key: uniqueRawKey(binding.capability.key, taken),
        label: componentLabel(component.id, binding.capability.label, component.label ?? null),
      },
    })),
  );
}

function mapComponent(component: Component, context: MappingContext): ComponentResult {
  const status = statusOfComponent(component);
  const references = activeCapabilities(component, status);
  const capabilities = new Set(references.map((entry) => entry.id));
  const work: ComponentWork = {
    component,
    status,
    taken: new Set(),
    bindings: [],
    covered: new Map(),
  };
  addStandard(work, { id: component.id, capabilities, status });
  const unresolved: string[] = [];
  for (const reference of references) {
    const definition = context.definitions.get(definitionKey(reference.id, reference.version ?? 1));
    if (definition === undefined) {
      unresolved.push(reference.id);
    }
    addRaw(work, reference, definition);
  }
  return { bindings: work.bindings, unresolved };
}

function modelOf(device: Device): string {
  const candidates = [
    device.ocf?.modelNumber,
    device.viper?.modelName,
    device.deviceTypeName,
    device.presentationId,
  ];
  return (
    candidates.find((entry): entry is string => typeof entry === 'string' && entry !== '') ??
    device.deviceId
  );
}

function detailsOf(device: Device, unresolved: readonly string[]): Record<string, JsonValue> {
  const firmware = device.ocf?.firmwareVersion ?? device.viper?.swVersion ?? null;
  return {
    locationId: device.locationId,
    integration: device.type ?? null,
    components: device.components.map((component) => component.id),
    firmware,
    health: device.healthState?.state ?? 'UNREPORTED',
    capabilitiesWithoutDefinition: [...new Set(unresolved)],
  };
}

export function mapDevice(device: Device, context: MappingContext): MappedDevice {
  const results = device.components.map((component) => mapComponent(component, context));
  const candidate = {
    provider: 'smartthings',
    externalId: device.deviceId,
    parentExternalId: device.parentDeviceId === '' ? null : (device.parentDeviceId ?? null),
    kind: deviceKindOf(device.components),
    name: device.label ?? device.name ?? device.deviceId,
    model: modelOf(device),
    manufacturer: device.manufacturerName,
    room: context.rooms.get(device.roomId) ?? null,
    online: (device.healthState?.state ?? 'ONLINE') === 'ONLINE',
    capabilities: results.flatMap((result) => result.bindings.map((binding) => binding.capability)),
    details: detailsOf(
      device,
      results.flatMap((result) => result.unresolved),
    ),
  };
  const parsed = DISCOVERED_DEVICE.safeParse(candidate);
  if (!parsed.success) {
    throw new SmartThingsResponseError('device', device.deviceId, parsed.error.message);
  }
  const status = Object.fromEntries(
    device.components.map((component) => [component.id, statusOfComponent(component)]),
  );
  return { device: parsed.data, bindings: results.flatMap((result) => result.bindings), status };
}
