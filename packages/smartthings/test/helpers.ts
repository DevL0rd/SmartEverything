import type { JsonValue } from '@smarteverything/domain';
import type { CapabilityMapper, ComponentView, StandardMapping } from '../src/mapper-kit';
import { allMappers } from '../src/mappers';
import type { ComponentStatus } from '../src/rest-schemas';

type Reported = JsonValue | { readonly value: JsonValue; readonly unit: string };

function isReported(
  entry: Reported,
): entry is { readonly value: JsonValue; readonly unit: string } {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    !Array.isArray(entry) &&
    'unit' in entry &&
    'value' in entry
  );
}

export function statusOf(
  entries: Readonly<Record<string, Readonly<Record<string, Reported>>>>,
): ComponentStatus {
  return Object.fromEntries(
    Object.entries(entries).map(([capability, attributes]) => [
      capability,
      Object.fromEntries(
        Object.entries(attributes).map(([attribute, entry]) => [
          attribute,
          isReported(entry) ? { value: entry.value, unit: entry.unit } : { value: entry },
        ]),
      ),
    ]),
  );
}

export function viewOf(
  entries: Readonly<Record<string, Readonly<Record<string, Reported>>>>,
  extra: readonly string[] = [],
): ComponentView {
  const status = statusOf(entries);
  return { id: 'main', capabilities: new Set([...Object.keys(status), ...extra]), status };
}

function mappersFor(capability: string): readonly CapabilityMapper[] {
  return allMappers().filter((mapper) => mapper.capability === capability);
}

export function mapperFor(capability: string): CapabilityMapper {
  const [mapper] = mappersFor(capability);
  if (mapper === undefined) {
    throw new Error(`no mapper for ${capability}`);
  }
  return mapper;
}

export function described(
  mapping: StandardMapping,
): Omit<StandardMapping, 'read' | 'write'> & { writable: boolean } {
  const { read: _read, write, ...rest } = mapping;
  return { ...rest, writable: write !== null };
}

export function single(capability: string, view: ComponentView): StandardMapping {
  const mappings = mapperFor(capability).map(view);
  const [mapping] = mappings;
  if (mapping === undefined || mappings.length !== 1) {
    throw new Error(`expected one mapping for ${capability}, got ${String(mappings.length)}`);
  }
  return mapping;
}

export function writeOf(mapping: StandardMapping, value: JsonValue): unknown {
  if (mapping.write === null) {
    throw new Error(`${mapping.key} is not writable`);
  }
  return mapping.write(value);
}
