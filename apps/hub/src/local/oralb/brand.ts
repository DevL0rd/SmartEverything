import {
  ApiError,
  BRUSH_SETTINGS,
  JSON_VALUE,
  ORALB_MODES,
  ORALB_RULES,
  brushSettingsOf,
  oralbModelKey,
  type BrushSettings,
  type BrushSettingsChange,
} from '@smarteverything/domain';
import type { BrushBrand } from '../toothbrush/brand';
import { oralbAct } from './acts';
import { oralbCapabilities } from './capabilities';
import { oralbWrites } from './gate';
import {
  ORALB_DRIVER,
  entryConfigOf,
  entryProfileOf,
  mergedBlock,
  oralbBlockOf,
  oralbSettingsOf,
} from './config';
import { oralbContentFilters } from './filters';
import { planOf } from './plan';
import { OralbRuntime } from './runtime';
import { oralbSetup } from './setup';

function mergedSettings(
  merged: BrushSettings,
  before: BrushSettings,
  change: BrushSettingsChange,
): BrushSettings {
  return {
    ...merged,
    model: before.model,
    defaultMode: before.defaultMode,
    defaultIntensity: before.defaultIntensity,
    sensors: before.sensors,
    oralb: mergedBlock(oralbBlockOf(before), change.oralb),
  };
}

export const oralbBrand: BrushBrand = {
  driver: ORALB_DRIVER,
  brand: 'oralb',
  rules: ORALB_RULES,
  profileOf: entryProfileOf,
  settingsOf: (raw) => brushSettingsOf(raw, 'oralb'),
  modelOf: (entry) => oralbSettingsOf(entry).model,
  runtime: (entry, port) => new OralbRuntime(entry, port),
  plan: planOf,
  capabilities: oralbCapabilities,
  modes: () => ORALB_MODES,
  writes: oralbWrites,
  act: oralbAct,
  mergeSettings: mergedSettings,
  savedConfig: (entry, settings) => ({
    ...entry.config,
    model: oralbModelKey(entryConfigOf(entry).identity),
    settings: JSON_VALUE.parse(BRUSH_SETTINGS.parse(settings)),
  }),
  contentFilters: oralbContentFilters,
  setup: (setup) =>
    new Promise((resolve) => {
      if (setup.driver !== ORALB_DRIVER) {
        throw new ApiError('invalid_request', `${setup.driver} is not an Oral-B toothbrush.`);
      }
      resolve(oralbSetup(setup));
    }),
};
