import type { StatusTone } from '../tone';
import type { OverlayClimateChip } from './overlays/model-types';

export const CLIMATE_TONES = [
  'info',
  'positive',
  'warning',
  'critical',
] as const satisfies readonly StatusTone[];

export function climateText(chip: Pick<OverlayClimateChip, 'temperature' | 'pm25'>): string {
  const temperature =
    chip.temperature === null ? null : `${chip.temperature.value}${chip.temperature.unit ?? ''}`;
  const pm = chip.pm25 === null ? null : `PM2.5 ${chip.pm25.value}`;
  return [temperature, pm].filter((part) => part !== null).join(' · ');
}

export function climateTone(chip: Pick<OverlayClimateChip, 'temperature' | 'pm25'>): StatusTone {
  return (chip.pm25 ?? chip.temperature)?.tone ?? 'info';
}
