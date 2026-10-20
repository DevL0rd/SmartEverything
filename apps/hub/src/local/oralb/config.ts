import {
  BRUSH_SETTINGS,
  JSON_VALUE,
  ORALB_DRIVER,
  ORALB_IDENTITY,
  ORALB_SETTINGS,
  brushSettingsOf,
  oralbProfileOf,
  type BrushSettings,
  type OralbIdentity,
  type OralbProfile,
  type OralbSettings,
  type OralbSettingsChange,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';

export { ORALB_DRIVER };

const SCHEDULE = z.array(z.number().int().min(0).max(255)).nullable();

const ENTRY_CONFIG = z.looseObject({
  model: z.string().min(1),
  room: z.string().nullable(),
  identity: ORALB_IDENTITY,
  settings: z.unknown(),
  schedule: SCHEDULE.default(null),
});

type OralbEntryConfig = z.infer<typeof ENTRY_CONFIG>;

type Config = LocalDeviceEntry['config'];

export function entryConfigOf(entry: Pick<LocalDeviceEntry, 'config'>): OralbEntryConfig {
  return ENTRY_CONFIG.parse(entry.config);
}

export function identityOf(entry: Pick<LocalDeviceEntry, 'config'>): OralbIdentity {
  return entryConfigOf(entry).identity;
}

export function entrySettingsOf(entry: Pick<LocalDeviceEntry, 'config'>): BrushSettings {
  return brushSettingsOf(entryConfigOf(entry).settings, 'oralb');
}

export function oralbBlockOf(settings: BrushSettings): OralbSettings {
  return settings.oralb ?? ORALB_SETTINGS.parse({});
}

export function oralbSettingsOf(entry: Pick<LocalDeviceEntry, 'config'>): OralbSettings {
  return oralbBlockOf(entrySettingsOf(entry));
}

export function scheduleOf(entry: Pick<LocalDeviceEntry, 'config'>): readonly number[] | null {
  return entryConfigOf(entry).schedule;
}

export function entryProfileOf(entry: Pick<LocalDeviceEntry, 'config'>): OralbProfile {
  const config = entryConfigOf(entry);
  return oralbProfileOf(config.identity, config.schedule);
}

export function withOralb(config: Config, change: (block: OralbSettings) => OralbSettings): Config {
  const settings = brushSettingsOf(ENTRY_CONFIG.parse(config).settings, 'oralb');
  return {
    ...config,
    settings: JSON_VALUE.parse(
      BRUSH_SETTINGS.parse({ ...settings, oralb: change(oralbBlockOf(settings)) }),
    ),
  };
}

export function withSchedule(config: Config, schedule: readonly number[]): Config {
  return { ...config, schedule: [...schedule] };
}

export function withFirmware(config: Config, firmware: number): Config {
  const identity = ENTRY_CONFIG.parse(config).identity;
  return { ...config, identity: JSON_VALUE.parse({ ...identity, firmware }) };
}

export function mergedBlock(
  block: OralbSettings,
  change: OralbSettingsChange | undefined,
): OralbSettings {
  const given = Object.entries(change ?? {}).filter(([, value]) => value !== undefined);
  return ORALB_SETTINGS.parse({ ...block, ...Object.fromEntries(given) });
}
