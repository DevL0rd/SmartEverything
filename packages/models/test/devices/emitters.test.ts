import {
  KINGSMITH_G15_MODEL,
  LARQ_PUREVIS_2_MODEL,
  ORALB_IO9_MODEL,
  XIAOMI_MAGNET_DW2HL_MODEL,
  XIAOMI_S400_SCALE_MODEL,
} from '@smarteverything/ble';
import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import {
  SAMSUNG_G9_OLED_49_MODEL,
  SAMSUNG_MICROWAVE_MODEL,
  SAMSUNG_S95B_65_MODEL,
} from '@smarteverything/smartthings';
import { TUYA_S06_PRO_MODEL } from '@smarteverything/tuya';
import {
  MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL,
  MIJIA_WASHER_DRYER_F29GL_MODEL,
  XIAOMI_AIR_PURIFIER_4_PRO_MODEL,
  XIAOMI_CAMERA_083AE2_MODEL,
  XIAOMI_PV11GL_ROBOT_MODEL,
  XIAOMI_PV11GL_STATION_MODEL,
  XIAOMI_SMART_HOME_HUB_2_MODEL,
  XIAOMI_SMART_SCENT_DIFFUSER_MODEL,
  XIAOMI_SMART_TOWER_FAN_2_MODEL,
  XIAOMI_WATCH_S5_46_MODEL,
  XIAOMI_WIRELESS_SWITCH_ROUND_MODEL,
} from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { GENERIC_PURIFIER_MODEL } from '../../src/devices/climate-2/purifier';
import { MODEL_REGISTRY } from '../../src/registry';

const EXACT_DEVICES: readonly ModelSpec[] = [
  KINGSMITH_G15_MODEL,
  LARQ_PUREVIS_2_MODEL,
  ORALB_IO9_MODEL,
  XIAOMI_MAGNET_DW2HL_MODEL,
  XIAOMI_S400_SCALE_MODEL,
  SAMSUNG_G9_OLED_49_MODEL,
  SAMSUNG_MICROWAVE_MODEL,
  SAMSUNG_S95B_65_MODEL,
  TUYA_S06_PRO_MODEL,
  MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL,
  MIJIA_WASHER_DRYER_F29GL_MODEL,
  XIAOMI_AIR_PURIFIER_4_PRO_MODEL,
  XIAOMI_CAMERA_083AE2_MODEL,
  XIAOMI_PV11GL_ROBOT_MODEL,
  XIAOMI_PV11GL_STATION_MODEL,
  XIAOMI_SMART_HOME_HUB_2_MODEL,
  XIAOMI_SMART_SCENT_DIFFUSER_MODEL,
  XIAOMI_SMART_TOWER_FAN_2_MODEL,
  XIAOMI_WATCH_S5_46_MODEL,
  XIAOMI_WIRELESS_SWITCH_ROUND_MODEL,
  GENERIC_PURIFIER_MODEL,
];

const DEVICES = MODEL_REGISTRY.filter((spec) => spec.id.startsWith('dev.'));

function darkens(channel: ModelSpecChannel, target: string, source: string): boolean {
  return (
    channel.target === target &&
    channel.property === 'emissive' &&
    channel.source === source &&
    channel.map.type === 'enum' &&
    channel.map.table['false'] === 0
  );
}

function glowsLast(spec: ModelSpec, target: string, source: string): boolean {
  const glows = (spec.channels ?? []).filter(
    (channel) => channel.target === target && channel.property === 'emissive',
  );
  const dark = glows.findLastIndex((channel) => darkens(channel, target, source));
  const lit = glows.findLastIndex(
    (channel) => channel.map.type !== 'enum' || channel.map.table['false'] !== 0,
  );
  return dark >= 0 && dark > lit;
}

function hides(spec: ModelSpec, target: string, source: string): boolean {
  return (spec.channels ?? []).some(
    (channel) =>
      channel.target === target &&
      channel.property === 'visible' &&
      channel.source === source &&
      channel.map.type === 'enum' &&
      channel.map.table['false'] === 0,
  );
}

function goesDark(spec: ModelSpec, target: string, source: string): boolean {
  const parents = new Map(spec.parts.map((part) => [part.id, part.parent]));
  for (let at: string | undefined = target; at !== undefined; at = parents.get(at)) {
    if (hides(spec, at, source)) return true;
  }
  return glowsLast(spec, target, source);
}

function emitters(specs: readonly ModelSpec[]): (readonly [string, ModelSpec, string])[] {
  return specs.flatMap((spec) =>
    (spec.anchors ?? [])
      .filter((anchor) => anchor.kind === 'emitter')
      .map((anchor) => [`${spec.id} ${anchor.id}`, spec, anchor.id] as const),
  );
}

function glowing(specs: readonly ModelSpec[]): (readonly [string, ModelSpec, string])[] {
  return specs.flatMap((spec) => {
    const targets = new Set([
      ...(spec.anchors ?? []).filter((anchor) => anchor.kind === 'emitter').map(({ id }) => id),
      ...(spec.channels ?? [])
        .filter((channel) => channel.property === 'emissive')
        .map(({ target }) => target),
    ]);
    return [...targets].map((target) => [`${spec.id} ${target}`, spec, target] as const);
  });
}

describe('device emitters', () => {
  it.each(emitters(DEVICES))('%s goes dark while offline', (_name, spec, emitter) => {
    const channels = spec.channels ?? [];
    expect(channels.some((channel) => darkens(channel, emitter, 'online'))).toBe(true);
  });

  it.each(glowing(EXACT_DEVICES))('%s goes dark while off or offline', (_name, spec, target) => {
    expect(goesDark(spec, target, 'power')).toBe(true);
    expect(goesDark(spec, target, 'online')).toBe(true);
  });
});
