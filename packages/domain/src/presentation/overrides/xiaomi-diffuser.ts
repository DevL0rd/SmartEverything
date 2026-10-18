import type { ModelOverride } from '../types';
import { XIAOMI_DEVICE_INFORMATION } from './xiaomi-common';

export const DIFFUSER_XW2IV: ModelOverride = {
  family: 'diffuser',
  capabilities: {
    ...XIAOMI_DEVICE_INFORMATION,
    power: { label: 'Power', tier: 'primary', keywords: ['diffuser', 'fragrance', 'scent'] },
    'raw:2.1': {
      label: 'Fault',
      tier: 'maintenance',
      role: 'fault',
      group: 'fragrance',
      states: ['Fault reported', 'No fault reported'],
    },
    'raw:2.3': {
      label: 'Spray duration',
      tier: 'primary',
      role: 'spray_duration',
      group: 'fragrance',
      unit: 's',
      keywords: ['scent', 'duration', 'strength', 'how strong', 'light', 'medium', 'strong'],
    },
    'raw:2.4': {
      label: 'Spray interval',
      tier: 'primary',
      role: 'spray_interval',
      group: 'fragrance',
      unit: 'min',
      keywords: ['scent', 'interval', 'strength', 'how often', 'light', 'medium', 'strong'],
    },
    'raw:action.4.1': {
      label: 'Spray now',
      tier: 'primary',
      role: 'spray',
      group: 'fragrance',
      danger: { tier: 'none' },
      keywords: ['scent', 'fragrance', 'spray'],
    },
    'raw:3.1': {
      label: 'Ambient light',
      tier: 'primary',
      role: 'ambient_light',
      group: 'lighting',
    },
    'raw:3.2': {
      label: 'Brightness',
      tier: 'primary',
      role: 'brightness',
      group: 'lighting',
      unit: '%',
    },
    'raw:3.3': {
      label: 'Colour',
      tier: 'primary',
      role: 'color',
      group: 'lighting',
      colorEncoding: 'packed_rgb',
      keywords: ['color', 'hue', 'rgb', 'ambient light'],
    },
    'raw:4.1': {
      label: 'Spray when someone moves',
      tier: 'control',
      role: 'auto_fragrance',
      group: 'fragrance',
      keywords: ['scent', 'auto fragrance', 'built-in', 'motion', 'movement', 'on the device'],
    },
    'raw:4.2': {
      label: 'Light when someone moves',
      tier: 'control',
      role: 'auto_light',
      group: 'lighting',
      keywords: ['ambient light', 'auto light', 'built-in', 'motion', 'movement', 'on the device'],
    },
    'raw:4.3': {
      label: 'Light auto-off',
      tier: 'control',
      role: 'light_auto_off',
      group: 'lighting',
    },
    battery: { label: 'Battery', tier: 'reading' },
    'raw:5.2': {
      label: 'Charging state',
      tier: 'reading',
      role: 'charging_state',
      group: 'energy',
      options: {
        Charging: 'Charging',
        'Not Charging': 'Not charging',
        'Not Chargeable': 'Not chargeable',
      },
    },
  },
};
