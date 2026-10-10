import type { DeviceKind } from '../../devices';
import type { CapabilityOverrides, ModelOverride } from '../types';
import { COMPUTER } from './computer';
import { SMARTTHINGS_PHONE_PRESENCE } from './smartthings-presence';
import { SMARTTHINGS_TV } from './smartthings-tv';
import { CAMERA_083AE2 } from './xiaomi-camera';
import { AIR_PURIFIER_VB4, HUMIDIFIER_600EK, TOWER_FAN_P45 } from './xiaomi-climate';
import { SCALE_S400_PRO, WATCH_S5 } from './xiaomi-health';

export const MODEL_OVERRIDES: Readonly<Record<string, ModelOverride>> = {
  'zhimi.airp.vb4': AIR_PURIFIER_VB4,
  'xiaomi.humidifier.600ek': HUMIDIFIER_600EK,
  'xiaomi.fan.p45': TOWER_FAN_P45,
  'xiaomi.camera.083ae2': CAMERA_083AE2,
  'xiaomi.scales.400pgj': SCALE_S400_PRO,
  'miwear.watch.p62g': WATCH_S5,
  'SmartThings-smartthings-Mobile_Presence': SMARTTHINGS_PHONE_PRESENCE,
};

export const KIND_OVERRIDES: Partial<Readonly<Record<DeviceKind, CapabilityOverrides>>> = {
  television: SMARTTHINGS_TV,
  computer: COMPUTER,
};
