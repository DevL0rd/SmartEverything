import type { CapabilityGroup, StandardCapability } from '../capabilities';
import { CAPABILITY_CATALOGUE, isStandardCapability } from '../capabilities';
import type { ValueDescriptor } from '../values';

export interface CatalogueRow {
  readonly label: string;
  readonly group: CapabilityGroup;
  readonly kind: ValueDescriptor['kind'];
  readonly keywords: readonly string[];
  readonly sampled?: boolean;
}

export interface DeviceSetPreset {
  readonly id: string;
  readonly name: string;
  readonly capability: StandardCapability;
  readonly group: CapabilityGroup;
  readonly valueKind: ValueDescriptor['kind'];
  readonly relative: boolean;
  readonly keywords: readonly string[];
  readonly inputs: { readonly control: string };
}

export const READ_ONLY_GROUPS: readonly CapabilityGroup[] = ['sensor', 'energy'];

export function isSettable(entry: CatalogueRow): boolean {
  return entry.sampled !== true && !READ_ONLY_GROUPS.includes(entry.group);
}

function presetFor(capability: StandardCapability, entry: CatalogueRow): DeviceSetPreset {
  return {
    id: `device.set.${capability}`,
    name: entry.label,
    capability,
    group: entry.group,
    valueKind: entry.kind,
    relative: entry.kind === 'action',
    keywords: entry.keywords,
    inputs: { control: capability },
  };
}

export function devicePresetsFrom(
  catalogue: Readonly<Record<string, CatalogueRow>>,
): readonly DeviceSetPreset[] {
  const presets: DeviceSetPreset[] = [];
  for (const [key, entry] of Object.entries(catalogue)) {
    if (isStandardCapability(key) && isSettable(entry)) presets.push(presetFor(key, entry));
  }
  return presets;
}

export function deviceSetPresets(): readonly DeviceSetPreset[] {
  return devicePresetsFrom(CAPABILITY_CATALOGUE);
}
