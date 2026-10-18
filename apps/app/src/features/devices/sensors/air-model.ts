import { PM25_UPPER_BOUNDS, airBand } from '@smarteverything/domain';
import { AIR_BAND_TONE } from '../../../components/air-look';
import type { GaugeBand } from '../../../components/charts';
import type { Tone } from '../../../components/tone';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import type { PowerState } from '../model/device-model';

export const PM25_GAUGE_MAX = 150;
const GAUGE_BANDS = 4;

export const PM25_BANDS: readonly GaugeBand[] = PM25_UPPER_BOUNDS.slice(0, GAUGE_BANDS).map(
  ([upper, band]) => ({ upTo: Math.min(upper, PM25_GAUGE_MAX), colour: AIR_BAND_COLOUR[band] }),
);

export function airBandColour(pm25: number | null): ColourRole {
  return pm25 === null ? 'on-surface-variant' : AIR_BAND_COLOUR[airBand(pm25)];
}

export function airStateTone(pm25: number | null, power: PowerState): Tone {
  return pm25 === null || power !== 'on' ? 'variant' : AIR_BAND_TONE[airBand(pm25)];
}

function waitingText(power: PowerState): string {
  switch (power) {
    case 'off':
      return 'Off';
    case 'offline':
      return 'No reading yet';
    case 'on':
    case 'unknown':
    case 'none':
      return 'Waiting for the first reading';
  }
}

export function airStateText(pm25: number | null, label: string, power: PowerState): string {
  if (pm25 === null) {
    return waitingText(power);
  }
  return power === 'off' ? `Off · ${label}` : label;
}
