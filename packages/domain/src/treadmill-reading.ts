import type { BeltMode, BeltState, HeartRateSource, PanelButton } from './treadmill';

export interface TreadmillReading {
  readonly state?: BeltState;
  readonly mode?: BeltMode;
  readonly speedKmh?: number;
  readonly targetSpeedKmh?: number;
  readonly timeS?: number;
  readonly distanceM?: number;
  readonly steps?: number;
  readonly averageSpeedKmh?: number;
  readonly inclinePercent?: number;
  readonly targetInclinePercent?: number;
  readonly elevationGainM?: number;
  readonly energyKcal?: number;
  readonly energyKcalPerHour?: number;
  readonly energyKcalPerMinute?: number;
  readonly heartRate?: number;
  readonly heartRateSource?: HeartRateSource;
  readonly met?: number;
  readonly remainingS?: number;
  readonly trainingStatus?: string;
  readonly button?: PanelButton;
}

export type MachineStatus =
  | { readonly kind: 'reset' }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'safety_stop' }
  | { readonly kind: 'started' }
  | { readonly kind: 'target_speed'; readonly kmh: number }
  | { readonly kind: 'target_incline'; readonly percent: number }
  | { readonly kind: 'control_lost' }
  | { readonly kind: 'other'; readonly opcode: number };

export const CONTROL_RESULTS = [
  'success',
  'not_supported',
  'invalid_parameter',
  'failed',
  'not_permitted',
] as const;

export type ControlResult = (typeof CONTROL_RESULTS)[number];

export type TreadmillInput =
  | { readonly kind: 'reading'; readonly at: string; readonly reading: TreadmillReading }
  | { readonly kind: 'machine_status'; readonly at: string; readonly status: MachineStatus };
