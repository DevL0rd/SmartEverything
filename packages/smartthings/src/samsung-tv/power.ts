import { z } from 'zod';
import { InvalidMacAddressError, SamsungTvMessageError } from '../errors';

export const REST_PORT = 8001;

export const WAKE_ON_LAN_PORT = 9;

export const BROADCAST_ADDRESS = '255.255.255.255';

const MAC_BYTES = 6;

const MAGIC_REPEATS = 16;

export function deviceInfoUrl(host: string): string {
  return `http://${host}:${String(REST_PORT)}/api/v2/`;
}

const DEVICE_INFO = z.object({
  type: z.string().optional(),
  device: z.object({
    PowerState: z.string().optional(),
    FrameTVSupport: z.enum(['true', 'false']).optional(),
    modelName: z.string().min(1).optional(),
    name: z.string().optional(),
  }),
});

export interface TvInfo {
  readonly on: boolean;
  readonly powerStateReported: boolean;
  readonly model: string | null;
  readonly frame: boolean;
}

export function readDeviceInfo(received: unknown): TvInfo {
  const parsed = DEVICE_INFO.safeParse(received);
  if (!parsed.success) {
    throw new SamsungTvMessageError(received, `device information: ${parsed.error.message}`);
  }
  const { PowerState: powerState, modelName, FrameTVSupport: frameSupport } = parsed.data.device;
  return {
    on: powerState === undefined || powerState === 'on',
    powerStateReported: powerState !== undefined,
    model: modelName ?? null,
    frame: frameSupport === 'true',
  };
}

export function macBytes(mac: string): Uint8Array {
  if (!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac)) {
    throw new InvalidMacAddressError(mac);
  }
  return Uint8Array.from(mac.split(/[:-]/), (pair) => Number.parseInt(pair, 16));
}

export function magicPacket(mac: string): Uint8Array {
  const address = macBytes(mac);
  const packet = new Uint8Array(MAC_BYTES + MAC_BYTES * MAGIC_REPEATS).fill(0xff, 0, MAC_BYTES);
  for (let repeat = 1; repeat <= MAGIC_REPEATS; repeat += 1) {
    packet.set(address, repeat * MAC_BYTES);
  }
  return packet;
}
