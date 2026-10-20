import { describe, expect, it } from 'vitest';
import { DEVICE_FAMILIES, deviceFamily, type DeviceFamily, type DeviceKind } from '../src';

const LIVE_MODELS: readonly (readonly [string, DeviceKind, DeviceFamily])[] = [
  ['lumi.sensor_switch.v2', 'other', 'button'],
  ['xiaomi.scales.400pgj', 'other', 'scale'],
  ['miwear.watch.p62g', 'other', 'wearable'],
  ['mibx5.washer.f29gl', 'appliance', 'laundry'],
  ['xiaomi.diffuser.xw2iv', 'other', 'diffuser'],
  ['lumi.gateway.mgl001', 'gateway', 'gateway'],
  ['isa.magnet.dw2hl', 'sensor', 'sensor'],
  ['S4SN-0U61X', 'sensor', 'sensor'],
  ['S06ProWB3S新界面', 'ir_blaster', 'ir_blaster'],
  ['GT-AXE16000', 'router', 'router'],
  ['AdGuard Home v0.107.78', 'dns_filter', 'dns_filter'],
  ['Syncthing v2.1.6', 'file_sync', 'file_sync'],
  ['AIBI robot', 'robot', 'robot'],
  ['zhimi.airp.vb4', 'air_purifier', 'air_purifier'],
  ['xiaomi.fan.p45', 'fan', 'tower_fan'],
  ['xiaomi.humidifier.600ek', 'humidifier', 'humidifier'],
  ['ESP25_SHRGB_01', 'light', 'light'],
];

describe('the family of every model in the home', () => {
  it.each(LIVE_MODELS)('puts %s (%s) in the %s family', (model, kind, family) => {
    expect(deviceFamily({ model, kind })).toBe(family);
  });

  it('knows the button family', () => {
    expect(DEVICE_FAMILIES).toContain('button');
  });

  it('treats other wireless remotes and buttons like the Aqara one', () => {
    expect(deviceFamily({ model: 'lumi.remote.b186acn01', kind: 'other' })).toBe('button');
    expect(deviceFamily({ model: 'vendor.button.one', kind: 'other' })).toBe('button');
  });
});
