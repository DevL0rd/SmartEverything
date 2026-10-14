import {
  ApiError,
  JSON_VALUE,
  SHELLY_PRESENCE_CORE_ACTIONS as CORE,
  type JsonValue,
  type ShellyPresenceAction,
} from '@smarteverything/domain';
import type { z } from 'zod';

export interface ShellyActionPlan {
  readonly method: string;
  readonly params: JsonValue;
}
export type ShellyActionMapper = (action: ShellyPresenceAction) => ShellyActionPlan | null;
export function jsonOf(value: unknown): JsonValue {
  const raw: unknown = JSON.parse(JSON.stringify(value));
  return JSON_VALUE.parse(raw);
}
export function rpcPlan(method: string, params: unknown): ShellyActionPlan {
  return { method, params: jsonOf(params) };
}
export function mappedAction<T>(
  schema: z.ZodType<T>,
  method: string,
  params: (action: T) => unknown,
): ShellyActionMapper {
  return (action): ShellyActionPlan | null => {
    const parsed = schema.safeParse(action);
    return parsed.success ? rpcPlan(method, params(parsed.data)) : null;
  };
}
export const CORE_PLANS: readonly ShellyActionMapper[] = [
  mappedAction(CORE[0], 'Presence.SetConfig', (action) => ({ config: action.config })),
  mappedAction(CORE[1], 'PresenceZone.SetConfig', (action) => ({
    id: action.id,
    config: action.config,
  })),
  mappedAction(CORE[2], 'Presence.AddZone', (action) => ({ config: action.config })),
  mappedAction(CORE[3], 'Presence.DeleteZone', (action) => ({ id: action.id })),
  mappedAction(CORE[4], 'Illuminance.SetConfig', (action) => ({
    id: action.id,
    config: action.config,
  })),
  mappedAction(CORE[5], 'Presence.SetSensor', (action) => ({ enable: action.enable })),
  mappedAction(CORE[6], 'Presence.TiltCalibrate', () => ({})),
  mappedAction(CORE[7], 'Presence.LiveTrack', () => ({})),
];
const COMPONENT_METHODS = {
  wifi: 'WiFi.SetConfig',
  ble: 'BLE.SetConfig',
  cloud: 'Cloud.SetConfig',
  mqtt: 'MQTT.SetConfig',
  ws: 'Ws.SetConfig',
  matter: 'Matter.SetConfig',
  zigbee: 'Zigbee.SetConfig',
  sys: 'Sys.SetConfig',
} as const;
export function componentActionPlan(action: ShellyPresenceAction): ShellyActionPlan | null {
  if (action.action !== 'set_component') return null;
  return rpcPlan(COMPONENT_METHODS[action.config.component], { config: action.config.value });
}
export function supportedMethod(methods: readonly string[], method: string): string {
  const actual = methods.find((candidate) => candidate.toLowerCase() === method.toLowerCase());
  if (actual === undefined)
    throw new ApiError('command_refused', `This sensor does not offer ${method}.`);
  return actual;
}
