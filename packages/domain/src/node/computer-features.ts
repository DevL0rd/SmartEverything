import { z } from 'zod';

export const COMPUTER_FEATURES = [
  'cpu',
  'memory',
  'disks',
  'network',
  'sensors',
  'fans',
  'cpu_power',
  'gpu',
  'gpu_processes',
  'battery',
  'audio',
  'audio_apps',
  'microphone',
  'displays',
  'display_modes',
  'display_enable',
  'brightness',
  'night_light',
  'hdr',
  'vrr',
  'power_profile',
  'dnd',
  'keyboard_layout',
  'wifi',
  'bluetooth',
  'windows',
  'startup_apps',
  'services',
  'usb',
  'processes',
  'process_priority',
  'files',
  'files_write',
  'capture',
  'ear_host',
] as const;

export type ComputerFeature = (typeof COMPUTER_FEATURES)[number];

const KNOWN_FEATURES: ReadonlySet<string> = new Set(COMPUTER_FEATURES);

export function isComputerFeature(value: string): value is ComputerFeature {
  return KNOWN_FEATURES.has(value);
}

export const COMPUTER_FEATURE_LIST = z
  .array(z.string())
  .transform((values): readonly ComputerFeature[] => values.filter(isComputerFeature));
