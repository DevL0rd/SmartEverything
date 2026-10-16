import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';

export const WIZ_CONTROL_PORT = 38899;
export const WIZ_PUSH_PORT = 38900;
export const WIZ_REGISTRATION_MS = 20_000;
export const WIZ_OFFLINE_MS = 75_000;
export const WIZ_MIN_BRIGHTNESS = 1;
export const WIZ_MAC = z
  .string()
  .regex(/^(?:[a-f\d]{12}|(?:[a-f\d]{2}:){5}[a-f\d]{2})$/i)
  .transform((value) => value.replaceAll(':', '').toLowerCase());
const BYTE = z.int().min(0).max(255);
export const WIZ_PILOT = z.object({
  mac: WIZ_MAC,
  state: z.boolean().optional(),
  dimming: z.int().min(0).max(100).optional(),
  temp: z.int().min(0).max(12000).optional(),
  r: BYTE.optional(),
  g: BYTE.optional(),
  b: BYTE.optional(),
  sceneId: z.int().min(0).max(1000).optional(),
  speed: z.int().min(0).max(200).optional(),
  rssi: z.int().min(-150).max(0).optional(),
});
export type WizPilot = z.output<typeof WIZ_PILOT>;
const RANGE = z.array(z.coerce.number().int().min(1000).max(12000)).min(2).max(8);
export const WIZ_CONFIG = z.object({
  mac: WIZ_MAC.optional(),
  moduleName: z.string().min(1).max(150).optional(),
  fwVersion: z.string().max(100).optional(),
  typeId: z.int().optional(),
  extRange: RANGE.optional(),
  cctRange: RANGE.optional(),
  whiteRange: RANGE.optional(),
  drvConf: z.array(z.number()).max(16).optional(),
});
export type WizConfig = z.output<typeof WIZ_CONFIG>;
export const WIZ_FRAME = z.object({
  method: z.string().min(1).max(80),
  id: z.union([z.int(), z.string().max(80)]).optional(),
  result: z.record(z.string(), JSON_VALUE).optional(),
  params: z.record(z.string(), JSON_VALUE).optional(),
  error: JSON_VALUE.optional(),
});
export type WizFrame = z.output<typeof WIZ_FRAME>;
export const WIZ_SAVED = z.object({
  mac: WIZ_MAC,
  address: z.ipv4(),
  config: WIZ_CONFIG,
  pilot: WIZ_PILOT,
});
export type WizSaved = z.output<typeof WIZ_SAVED>;

export class WizProtocolError extends Error {
  override readonly name = 'WizProtocolError';
  constructor(
    readonly method: string,
    readonly reason: string,
  ) {
    super(`WiZ ${method}: ${reason}`);
  }
}
