import type { CapabilityGroup } from '../../capabilities';
import type { CapabilityOverride, CapabilityOverrides, PresentationTier } from '../types';

export type OverrideMaker = (
  label: string,
  extra?: Partial<CapabilityOverride>,
) => CapabilityOverride;

export function overrideOf(tier: PresentationTier, group: CapabilityGroup): OverrideMaker {
  return (label, extra = {}) => ({ label, tier, group, ...extra });
}

export const diagnostic = overrideOf('diagnostic', 'system');

export const hidden = overrideOf('hidden', 'system');

export const setting = overrideOf('setting', 'system');

export const XIAOMI_DEVICE_INFORMATION: CapabilityOverrides = {
  'raw:1.1': diagnostic('Manufacturer'),
  'raw:1.2': diagnostic('Model'),
  'raw:1.3': diagnostic('Device ID'),
  'raw:1.5': diagnostic('Serial number'),
  firmware: diagnostic('Firmware'),
};

export const LEVEL_LABELS: Readonly<Record<string, string>> = {
  Level1: 'Low',
  Level2: 'Medium',
  Level3: 'High',
};
