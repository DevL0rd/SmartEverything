import {
  SONICARE_DRIVER,
  SONICARE_IDENTITY,
  MODEL_CHOICES,
  brushSettingsOf,
  sonicareProfileOf,
  type SonicareIdentity,
  type SonicareProfile,
  type BrushSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';

export { SONICARE_DRIVER };

const ENTRY_CONFIG = z.object({
  model: z.string().min(1),
  room: z.string().nullable(),
  identity: SONICARE_IDENTITY,
  settings: z.unknown(),
});

export type SonicareEntryConfig = z.infer<typeof ENTRY_CONFIG>;

export function entryConfigOf(entry: LocalDeviceEntry): SonicareEntryConfig {
  return ENTRY_CONFIG.parse(entry.config);
}

export function entrySettingsOf(entry: LocalDeviceEntry): BrushSettings {
  return brushSettingsOf(entryConfigOf(entry).settings);
}

export function effectiveIdentity(
  identity: SonicareIdentity,
  settings: BrushSettings,
): SonicareIdentity {
  const choice = MODEL_CHOICES.find((candidate) => candidate.key === settings.model);
  return choice === undefined
    ? identity
    : { ...identity, model: choice.model, stack: choice.stack };
}

export function entryProfileOf(entry: LocalDeviceEntry): SonicareProfile {
  const config = entryConfigOf(entry);
  return sonicareProfileOf(effectiveIdentity(config.identity, brushSettingsOf(config.settings)));
}
