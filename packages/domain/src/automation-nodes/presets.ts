import type { CapabilityGroup, StandardCapability } from '../capabilities';
import { CAPABILITY_CATALOGUE, isStandardCapability } from '../capabilities';
import type { JsonValue, ValueDescriptor } from '../values';

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

export interface LightSetPreset {
  readonly id: string;
  readonly name: string;
  readonly meaning: string;
  readonly kindId: 'light.set';
  readonly ports: Readonly<Record<string, JsonValue>>;
  readonly keywords: readonly string[];
}

export const LIGHT_SET_PRESETS: readonly LightSetPreset[] = [
  {
    id: 'light.set.on',
    name: 'Lights on',
    meaning: 'Turns the lights on.',
    kindId: 'light.set',
    ports: { power: 'on' },
    keywords: ['lights', 'on', 'switch', 'turn on'],
  },
  {
    id: 'light.set.off',
    name: 'Lights off',
    meaning: 'Turns the lights off.',
    kindId: 'light.set',
    ports: { power: 'off' },
    keywords: ['lights', 'off', 'switch', 'turn off', 'dark'],
  },
  {
    id: 'light.set.warm_white',
    name: 'Warm white lights',
    meaning: 'Turns the lights on in a warm white.',
    kindId: 'light.set',
    ports: { power: 'on', colorTemperature: 2700 },
    keywords: ['lights', 'warm', 'white', 'cosy', 'evening', 'kelvin'],
  },
  {
    id: 'light.set.cool_white',
    name: 'Cool white lights',
    meaning: 'Turns the lights on in a cool daylight white.',
    kindId: 'light.set',
    ports: { power: 'on', colorTemperature: 6500 },
    keywords: ['lights', 'cool', 'white', 'daylight', 'work', 'kelvin'],
  },
  {
    id: 'light.set.dim',
    name: 'Dim lights',
    meaning: 'Dims the lights to a low level and leaves their power as it is.',
    kindId: 'light.set',
    ports: { brightness: 20 },
    keywords: ['lights', 'dim', 'low', 'movie', 'brightness'],
  },
  {
    id: 'light.set.full',
    name: 'Full brightness lights',
    meaning: 'Turns the lights on at full brightness.',
    kindId: 'light.set',
    ports: { power: 'on', brightness: 100 },
    keywords: ['lights', 'bright', 'full', 'max', 'brightness'],
  },
];
