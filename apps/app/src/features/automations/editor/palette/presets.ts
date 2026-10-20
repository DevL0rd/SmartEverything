import {
  TRIGGER_PRESETS,
  deviceSetPresets,
  type DeviceSetPreset,
  type TriggerPreset,
} from '@smarteverything/domain';
import type { PaletteEntry } from './palette-categories';

export const PRESET_KIND_ID = 'device.set';

const VALUE_WORDS: Readonly<Record<DeviceSetPreset['valueKind'], string>> = {
  boolean: 'on/off',
  number: 'number',
  enum: 'choice',
  color: 'colour',
  text: 'text',
  action: 'action',
};

const VALUE_TAKES: Readonly<Record<DeviceSetPreset['valueKind'], string>> = {
  boolean: 'Takes devices, an on/off value',
  number: 'Takes devices, a number',
  enum: 'Takes devices, a choice',
  color: 'Takes devices, a colour',
  text: 'Takes devices, text',
  action: 'Takes devices',
};

function meaningOf(preset: DeviceSetPreset): string {
  const what = preset.name.toLowerCase();
  return preset.relative ? `Press ${what} on devices.` : `Set ${what} on devices.`;
}

export function presetEntry(preset: DeviceSetPreset): PaletteEntry {
  return {
    key: `preset:${preset.id}`,
    choice: { source: 'preset', presetId: preset.id, control: preset.inputs.control },
    name: preset.name,
    meaning: meaningOf(preset),
    takes: VALUE_TAKES[preset.valueKind],
    icon: 'customize',
    section: 'devices',
    keywords: [...preset.keywords, preset.group, preset.capability.replaceAll('_', ' ')],
    typeWords: ['device', VALUE_WORDS[preset.valueKind]],
    gives: [],
    kindId: PRESET_KIND_ID,
    usageId: preset.id,
    trigger: false,
    disabled: null,
  };
}

export function triggerPresetEntry(preset: TriggerPreset): PaletteEntry {
  return {
    key: `preset:${preset.id}`,
    choice: {
      source: 'trigger-preset',
      presetId: preset.id,
      kindId: preset.kindId,
      ports: preset.ports,
    },
    name: preset.name,
    meaning: preset.meaning,
    takes: 'Takes nothing',
    icon: 'cloud-rain',
    section: 'triggers',
    keywords: [...preset.keywords, 'weather'],
    typeWords: ['weather'],
    gives: [],
    kindId: preset.kindId,
    usageId: preset.id,
    trigger: true,
    disabled: null,
  };
}

export function presetEntries(
  presets: readonly DeviceSetPreset[] = deviceSetPresets(),
  triggers: readonly TriggerPreset[] = TRIGGER_PRESETS,
): readonly PaletteEntry[] {
  return [...presets.map(presetEntry), ...triggers.map(triggerPresetEntry)];
}
