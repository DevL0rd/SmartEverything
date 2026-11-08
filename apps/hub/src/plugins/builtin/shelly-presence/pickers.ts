import {
  PLUGIN_OPTION,
  type JsonValue,
  type PluginOption,
  type PluginOptionPage,
} from '@smarteverything/domain';
import {
  SHELLY_SNAPSHOT,
  SHELLY_SNAPSHOT_STREAM,
  type ShellyDevice,
  type ShellySnapshot,
  type ShellyZone,
} from '@smarteverything/shelly';
import type { PluginContext, PluginOptionProvider, PluginStop } from '../contract';
import { jsonOf } from '../json-value';
import { SHELLY_SENSOR_PICKER, SHELLY_ZONE_PICKER, SHELLY_ZONES_STREAM } from './automation';
import { shellyZoneValid } from './presence-validity';
import type { ShellySettings } from './settings';
import { optionPage } from '../automation-kit-pages';

type Observed = Pick<PluginContext<ShellySettings>, 'options' | 'data' | 'log'>;

const TEXT_MAX = 200;

const NOT_REPORTED = 'Shelly Presence has not reported yet.';

const NO_SENSOR = 'No Shelly Presence sensor is added yet.';

const NO_ZONE = 'No Shelly Presence zone is set up yet.';

function fit(text: string): string {
  return text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text;
}

type Skipped = (id: string) => void;

function listable(
  id: string,
  label: string,
  detail: string,
  skipped: Skipped,
): readonly PluginOption[] {
  const parsed = PLUGIN_OPTION.safeParse({
    id,
    label: fit(label),
    detail: fit(detail),
    color: null,
    image: null,
  });
  if (parsed.success) return [parsed.data];
  skipped(id);
  return [];
}

function reachability(sensor: ShellyDevice): string {
  return sensor.connection.state === 'online' ? 'Online' : 'Not connected';
}

function zoneName(zone: ShellyZone): string {
  const name = zone.config.name?.trim() ?? '';
  return name === '' ? `Zone ${String(zone.config.id)}` : name;
}

export function sensorOptions(snapshot: ShellySnapshot, skipped: Skipped): readonly PluginOption[] {
  return snapshot.devices.flatMap((sensor) =>
    listable(sensor.externalId, sensor.name, reachability(sensor), skipped),
  );
}

export function zoneOptions(snapshot: ShellySnapshot, skipped: Skipped): readonly PluginOption[] {
  return snapshot.devices.flatMap((sensor) =>
    sensor.zones.flatMap((zone) =>
      listable(
        zone.externalId,
        `${sensor.name} · ${zoneName(zone)}`,
        reachability(sensor),
        skipped,
      ),
    ),
  );
}

interface Reading {
  readonly id: string;
  readonly occupied: boolean;
  readonly count: number;
}

function readingOf(sensor: ShellyDevice, zone: ShellyZone): Reading | null {
  const { status } = zone;
  if (!shellyZoneValid(sensor, zone) || status === null) return null;
  if (status.value === null || status.num_objects === null) return null;
  return { id: zone.externalId, occupied: status.value, count: status.num_objects };
}

export function zoneReadings(snapshot: ShellySnapshot): JsonValue {
  const zones = snapshot.devices.flatMap((sensor) =>
    sensor.zones.flatMap((zone) => readingOf(sensor, zone) ?? []),
  );
  return jsonOf({ zones });
}

function unavailable(message: string): Promise<PluginOptionPage> {
  return Promise.resolve({ state: 'unavailable', message });
}

export function shellyPicker(
  optionsOf: (snapshot: ShellySnapshot, skipped: Skipped) => readonly PluginOption[],
  empty: string,
  latest: () => ShellySnapshot | null,
  skipped: Skipped,
): PluginOptionProvider {
  return (query) => {
    const snapshot = latest();
    if (snapshot === null) return unavailable(NOT_REPORTED);
    const options = optionsOf(snapshot, skipped);
    if (options.length === 0) return unavailable(empty);
    return Promise.resolve(optionPage(options, query));
  };
}

const PICKERS = [
  [SHELLY_SENSOR_PICKER, sensorOptions, NO_SENSOR],
  [SHELLY_ZONE_PICKER, zoneOptions, NO_ZONE],
] as const;

function parsedSnapshot(ctx: Observed, value: JsonValue): ShellySnapshot | null {
  const parsed = SHELLY_SNAPSHOT.safeParse(value);
  if (parsed.success) return parsed.data;
  ctx.log.error('shelly.picker_snapshot_invalid', parsed.error);
  return null;
}

export async function startWithPickers<C extends Observed>(
  ctx: C,
  start: (ctx: C) => Promise<PluginStop>,
): Promise<PluginStop> {
  let latest: ShellySnapshot | null = null;
  const unregister = PICKERS.map(([source, optionsOf, empty]) =>
    ctx.options.register(
      source,
      shellyPicker(
        optionsOf,
        empty,
        () => latest,
        (id) => {
          ctx.log.warn('shelly.option_not_listable', { source, length: id.length });
        },
      ),
    ),
  );
  const release = (): void => {
    unregister.forEach((unregisterOne) => {
      unregisterOne();
    });
  };
  const observed: C = {
    ...ctx,
    data: {
      publish: (stream: string, value: JsonValue): void => {
        ctx.data.publish(stream, value);
        if (stream !== SHELLY_SNAPSHOT_STREAM) return;
        const snapshot = parsedSnapshot(ctx, value);
        if (snapshot === null) return;
        latest = snapshot;
        ctx.data.publish(SHELLY_ZONES_STREAM, zoneReadings(snapshot));
      },
    },
  };
  try {
    const stop = await start(observed);
    return async () => {
      try {
        await stop();
      } finally {
        release();
      }
    };
  } catch (cause) {
    release();
    throw cause;
  }
}
