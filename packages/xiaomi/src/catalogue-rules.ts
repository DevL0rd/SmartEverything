import type { StandardCapability } from '@smarteverything/domain';

export interface CatalogueRule {
  readonly service: string | null;
  readonly name: string;
  readonly key: StandardCapability;
}

function rule(service: string | null, name: string, key: StandardCapability): CatalogueRule {
  return { service, name, key };
}

export const PROPERTY_RULES: readonly CatalogueRule[] = [
  rule('indicator-light', 'on', 'status_light'),
  rule(null, 'on', 'power'),
  rule('light', 'brightness', 'brightness'),
  rule('light', 'color-temperature', 'color_temperature'),
  rule('light', 'color', 'color'),
  rule('light', 'mode', 'light_effect'),
  rule('air-purifier', 'mode', 'purifier_mode'),
  rule('humidifier', 'fan-level', 'mist_level'),
  rule(null, 'fan-level', 'fan_mode'),
  rule(null, 'fan-level', 'fan_speed'),
  rule(null, 'target-humidity', 'target_humidity'),
  rule(null, 'target-temperature', 'target_temperature'),
  rule(null, 'relative-humidity', 'humidity'),
  rule(null, 'temperature', 'temperature'),
  rule(null, 'pm2.5-density', 'pm25'),
  rule(null, 'pm10-density', 'pm10'),
  rule(null, 'co2-density', 'co2'),
  rule(null, 'tvoc-density', 'tvoc'),
  rule(null, 'hcho-density', 'hcho'),
  rule(null, 'air-quality-index', 'air_quality_index'),
  rule('filter', 'filter-life-level', 'filter_life'),
  rule('physical-controls-locked', 'physical-controls-locked', 'child_lock'),
  rule('alarm', 'alarm', 'buzzer'),
  rule('screen', 'brightness', 'display_brightness'),
  rule(null, 'water-level', 'water_level'),
  rule(null, 'illumination', 'illuminance'),
  rule('motion-sensor', 'motion-state', 'motion'),
  rule('magnet-sensor', 'contact-state', 'contact'),
  rule(null, 'submersion-state', 'leak'),
  rule('battery', 'battery-level', 'battery'),
  rule('camera-control', 'night-shot', 'night_vision'),
  rule('camera-control', 'time-watermark', 'watermark'),
  rule('camera-control', 'recording-mode', 'recording'),
  rule('motion-detection', 'motion-detection', 'motion_detection'),
  rule('motion-detection', 'detection-sensitivity', 'motion_sensitivity'),
  rule('memory-card-management', 'storage-free-space', 'storage_free'),
  rule('key-call', 'key-call-status', 'call_status'),
  rule('speaker', 'volume', 'volume'),
  rule('speaker', 'mute', 'mute'),
  rule('device-information', 'firmware-revision', 'firmware'),
  rule('arming', 'arming-mode', 'alarm'),
];

export const ACTION_RULES: readonly CatalogueRule[] = [
  rule('filter', 'reset-filter-life', 'filter_reset'),
];

export function candidateKeys(
  rules: readonly CatalogueRule[],
  service: string | null,
  name: string | null,
): StandardCapability[] {
  return rules
    .filter(
      (candidate) =>
        candidate.name === name && (candidate.service === null || candidate.service === service),
    )
    .map((candidate) => candidate.key);
}
