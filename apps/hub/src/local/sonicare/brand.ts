import {
  ApiError,
  BRUSH_SETTINGS,
  JSON_VALUE,
  SONICARE_RULES,
  brushSettingsOf,
  sonicareModelKey,
  type BrushSettings,
  type BrushSettingsChange,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { BrushBrand } from '../toothbrush/brand';
import { brushCapabilities, availableModes } from './capabilities';
import { sonicareWrites } from './commands';
import { SONICARE_DRIVER, effectiveIdentity, entryConfigOf, entryProfileOf } from './config';
import { sonicareContentFilters } from './filters';
import { planOf } from './plan';
import { SonicareRuntime } from './runtime';
import { sonicareSetup } from './setup';

function identityOf(entry: LocalDeviceEntry): ReturnType<typeof effectiveIdentity> {
  const config = entryConfigOf(entry);
  return effectiveIdentity(config.identity, brushSettingsOf(config.settings));
}

function mergedSettings(
  merged: BrushSettings,
  before: BrushSettings,
  change: BrushSettingsChange,
): BrushSettings {
  return {
    ...merged,
    model: change.model === undefined ? before.model : change.model,
    defaultMode: change.defaultMode === undefined ? before.defaultMode : change.defaultMode,
    defaultIntensity:
      change.defaultIntensity === undefined ? before.defaultIntensity : change.defaultIntensity,
    sensors: {
      pressure: change.sensors?.pressure ?? before.sensors.pressure,
      temperature: change.sensors?.temperature ?? before.sensors.temperature,
      motion: change.sensors?.motion ?? before.sensors.motion,
    },
  };
}

export const sonicareBrand: BrushBrand = {
  driver: SONICARE_DRIVER,
  brand: 'sonicare',
  rules: SONICARE_RULES,
  profileOf: entryProfileOf,
  settingsOf: (raw) => brushSettingsOf(raw),
  modelOf: (entry) => identityOf(entry).model,
  runtime: (entry) => new SonicareRuntime(entry),
  plan: planOf,
  capabilities: (entry) => brushCapabilities(entryProfileOf(entry), identityOf(entry)),
  modes: (entry) => availableModes(entryProfileOf(entry), identityOf(entry)),
  writes: sonicareWrites,
  act: () =>
    Promise.reject(
      new ApiError('invalid_request', 'This action is not available for this toothbrush.'),
    ),
  mergeSettings: mergedSettings,
  savedConfig: (entry, settings) => ({
    ...entry.config,
    model: sonicareModelKey(effectiveIdentity(entryConfigOf(entry).identity, settings)),
    settings: JSON_VALUE.parse(BRUSH_SETTINGS.parse(settings)),
  }),
  contentFilters: sonicareContentFilters,
  setup: (setup) => {
    if (setup.driver !== SONICARE_DRIVER) {
      return Promise.reject(
        new ApiError('invalid_request', `${setup.driver} is not a Philips Sonicare toothbrush.`),
      );
    }
    return Promise.resolve(sonicareSetup(setup));
  },
};
