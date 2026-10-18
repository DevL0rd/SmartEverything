import type { JsonValue } from '@smarteverything/domain';
import {
  SHELLY_ZONE_SETTINGS,
  shellyMethod,
  shellyZoneWrite,
  type ShellyAction,
  type ShellyDevice,
} from '@smarteverything/shelly';
import { z } from 'zod';
import { jsonOf } from '../json-value';

export type ShellyParams = Readonly<Record<string, unknown>>;
interface ShellyCall {
  readonly method: string;
  readonly params: JsonValue;
}

const OBJECT = z.record(z.string(), z.unknown());
const TYPED = z.object({ component: z.string(), value: z.unknown() });
const ZONE_PATCH = SHELLY_ZONE_SETTINGS.partial();

function flatten(params: ShellyParams, key: string): ShellyParams {
  const { [key]: inner, ...rest } = params;
  return { ...rest, ...OBJECT.parse(inner) };
}

function typed(
  params: ShellyParams,
  key: string,
): { readonly rest: ShellyParams; readonly component: string; readonly value: unknown } {
  const { [key]: inner, ...rest } = params;
  return { rest, ...TYPED.parse(inner) };
}

type Typed = ReturnType<typeof typed>;

function retyped(
  key: string,
  shape: (value: Typed) => ShellyParams,
): (params: ShellyParams) => ShellyParams {
  return (params: ShellyParams): ShellyParams => shape(typed(params, key));
}

function zoneWrite(params: ShellyParams, device: ShellyDevice): ShellyParams {
  const { id, config } = z.object({ id: z.int(), config: OBJECT }).parse(params);
  const existing = device.zones.find((zone) => zone.config.id === id);
  return { id, config: shellyZoneWrite(existing?.config ?? {}, ZONE_PATCH.parse(config)) };
}

function sensorWrite(params: ShellyParams): ShellyParams {
  const { config, ...rest } = params;
  const { idx, ...sensor } = z.object({ idx: z.unknown() }).catchall(z.unknown()).parse(config);
  return { ...rest, config: { ...sensor, obj_idx: idx } };
}

const SHAPES: Partial<
  Record<ShellyAction, (params: ShellyParams, device: ShellyDevice) => ShellyParams>
> = {
  set_zone: zoneWrite,
  set_component: retyped('config', ({ value }) => ({ config: value })),
  schedule_create: (params) => flatten(params, 'schedule'),
  schedule_update: (params) => flatten(params, 'schedule'),
  webhook_create: (params) => flatten(params, 'webhook'),
  webhook_update: (params) => flatten(params, 'webhook'),
  firmware_update: (params) => flatten(params, 'update'),
  device_reset: () => ({}),
  virtual_add: retyped('config', ({ rest, component, value }) => ({
    ...rest,
    type: component,
    config: value,
  })),
  virtual_config: retyped('config', ({ rest, value }) => ({ ...rest, config: value })),
  virtual_set: retyped('setting', ({ rest, value }) => ({ ...rest, value })),
  bthome_add_sensor: sensorWrite,
};

function methodOf(action: ShellyAction, params: ShellyParams): string {
  return action === 'device_reset' && params['target'] === 'wifi'
    ? 'Shelly.ResetWiFiConfig'
    : shellyMethod(action, params);
}

export function shellyCall(
  action: ShellyAction,
  params: ShellyParams,
  device: ShellyDevice,
): ShellyCall {
  const shape = SHAPES[action];
  return {
    method: methodOf(action, params),
    params: jsonOf(shape === undefined ? params : shape(params, device)),
  };
}

export function listedMethod(methods: readonly string[], method: string): string {
  return methods.find((candidate) => candidate.toLowerCase() === method.toLowerCase()) ?? method;
}
