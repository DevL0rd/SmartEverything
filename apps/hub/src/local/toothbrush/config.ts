import type { BrushProfile, BrushSettings } from '@smarteverything/domain';
import { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { brandOfEntry } from './brands';

const SHARED_CONFIG = z.looseObject({ settings: z.unknown() });

export function entrySettingsOf(entry: LocalDeviceEntry): BrushSettings {
  return brandOfEntry(entry).settingsOf(SHARED_CONFIG.parse(entry.config).settings);
}

export function entryProfileOf(entry: LocalDeviceEntry): BrushProfile {
  return brandOfEntry(entry).profileOf(entry);
}
