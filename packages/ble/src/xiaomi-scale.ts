import { uint8, uint32 } from './bytes';
import type { MiBeaconObject } from './mibeacon';

const XIAOMI_SCALE_PRODUCTS: ReadonlySet<number> = new Set([
  0x30d9, 0x3bd5, 0x48cf, 0x4b05, 0x78bd,
]);

export const SCALE_MEASUREMENT_OBJECT = 0x6e16;

const OBJECT_BYTES = 9;
const NO_HEART_RATE = 127;
const HEART_RATE_OFFSET = 50;

export type ScalePacket =
  | {
      readonly kind: 'measurement';
      readonly scaleUser: number;
      readonly measuredAt: number;
      readonly weightKg: number | null;
      readonly heartRate: number | null;
      readonly impedance: number | null;
    }
  | { readonly kind: 'stepped_off'; readonly scaleUser: number };

export class ScalePacketError extends Error {
  override readonly name = 'ScalePacketError';
}

function present(raw: number, scale: number): number | null {
  return raw === 0 ? null : raw / scale;
}

export function isXiaomiScale(productId: number): boolean {
  return XIAOMI_SCALE_PRODUCTS.has(productId);
}

export function decodeScaleObject(object: MiBeaconObject): ScalePacket {
  if (object.id !== SCALE_MEASUREMENT_OBJECT || object.data.length !== OBJECT_BYTES) {
    throw new ScalePacketError(
      `Expected object 0x6e16 of 9 bytes, received 0x${object.id.toString(16)} of ${String(object.data.length)}.`,
    );
  }
  const scaleUser = uint8(object.data, 0);
  const packed = uint32(object.data, 1);
  const weight = packed & 0x7ff;
  const heart = (packed >>> 11) & 0x7f;
  const impedance = packed >>> 18;
  if (weight === 0 && heart === 0 && impedance === 0) {
    return { kind: 'stepped_off', scaleUser };
  }
  return {
    kind: 'measurement',
    scaleUser,
    measuredAt: uint32(object.data, 5),
    weightKg: present(weight, 10),
    heartRate: heart === 0 || heart === NO_HEART_RATE ? null : heart + HEART_RATE_OFFSET,
    impedance: present(impedance, 10),
  };
}
