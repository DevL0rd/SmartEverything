import type { DeviceKind } from '../../devices';
import type {
  CapabilityMatch,
  CapabilityOverrides,
  ModelOverride,
  PresentableDevice,
} from '../types';
import { COMPUTER } from './computer';
import { PRINTER_MATCH } from './printer';
import { SMARTTHINGS_MICROWAVE_MATCH } from './smartthings-microwave';
import { SMARTTHINGS_TV } from './smartthings-tv';
import { CAMERA_083AE2 } from './xiaomi-camera';
import { AIR_PURIFIER_VB4, HUMIDIFIER_600EK, TOWER_FAN_P45 } from './xiaomi-climate';
import { DIFFUSER_XW2IV } from './xiaomi-diffuser';
import { SCALE_S400_PRO, WATCH_S5 } from './xiaomi-health';
import { WASHER_F29GL } from './xiaomi-laundry';

export const MODEL_OVERRIDES: Readonly<Record<string, ModelOverride>> = {
  'zhimi.airp.vb4': AIR_PURIFIER_VB4,
  'xiaomi.humidifier.600ek': HUMIDIFIER_600EK,
  'xiaomi.diffuser.xw2iv': DIFFUSER_XW2IV,
  'xiaomi.fan.p45': TOWER_FAN_P45,
  'xiaomi.camera.083ae2': CAMERA_083AE2,
  'xiaomi.scales.400pgj': SCALE_S400_PRO,
  'miwear.watch.p62g': WATCH_S5,
  'mibx5.washer.f29gl': WASHER_F29GL,
};

const CAPABILITY_OVERRIDES: readonly CapabilityMatch[] = [
  SMARTTHINGS_MICROWAVE_MATCH,
  PRINTER_MATCH,
];

export function modelOverrideOf(device: PresentableDevice): ModelOverride | undefined {
  const byModel = MODEL_OVERRIDES[device.model];
  if (byModel !== undefined || device.capabilities === undefined) {
    return byModel;
  }
  const candidates = CAPABILITY_OVERRIDES.filter((match) => match.kind === device.kind);
  if (candidates.length === 0) {
    return undefined;
  }
  const keys = new Set(device.capabilities.map((capability) => capability.key));
  return candidates.find((match) => match.requires.every((key) => keys.has(key)))?.override;
}

export const KIND_OVERRIDES: Partial<Readonly<Record<DeviceKind, CapabilityOverrides>>> = {
  television: SMARTTHINGS_TV,
  computer: COMPUTER,
};
