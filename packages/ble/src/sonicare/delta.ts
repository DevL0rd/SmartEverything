import type { BrushHeadType, BrushPressure } from '@smarteverything/domain';

export const HANDLE_STATES = [
  'off',
  'standby',
  'run',
  'charge',
  'shutdown',
  undefined,
  'validate',
  'background',
] as const;

export type HandleStateName = NonNullable<(typeof HANDLE_STATES)[number]>;

export const BRUSHING_STATES = ['off', 'on', 'pause', 'complete', 'aborted'] as const;

export type BrushingStateName = (typeof BRUSHING_STATES)[number];

export interface BrushDelta {
  readonly battery?: number | undefined;
  readonly batteryMillivolts?: number | undefined;
  readonly model?: string | undefined;
  readonly serial?: string | undefined;
  readonly firmware?: string | undefined;
  readonly manufacturer?: string | undefined;
  readonly pnp?: string | undefined;
  readonly handleState?: HandleStateName | null | undefined;
  readonly brushingState?: BrushingStateName | null | undefined;
  readonly modePosition?: number | undefined;
  readonly modeRoutineId?: number | undefined;
  readonly routineIds?: readonly number[] | undefined;
  readonly availableRoutines?: number | undefined;
  readonly intensity?: number | undefined;
  readonly elapsedS?: number | undefined;
  readonly routineS?: number | undefined;
  readonly sessionId?: number | undefined;
  readonly latestStoredId?: number | undefined;
  readonly storedCount?: number | undefined;
  readonly motorSeconds?: number | undefined;
  readonly handleClock?: number | undefined;
  readonly headSerial?: string | null | undefined;
  readonly headType?: BrushHeadType | undefined;
  readonly headMade?: string | undefined;
  readonly headLimitS?: number | undefined;
  readonly headUsageS?: number | undefined;
  readonly headRing?: number | undefined;
  readonly nfcVersion?: string | undefined;
  readonly nfcUrl?: string | undefined;
  readonly errorPersistent?: number | undefined;
  readonly errorVolatile?: number | undefined;
  readonly settingsBits?: number | undefined;
  readonly sensorMask?: number | undefined;
  readonly pressure?: BrushPressure | undefined;
  readonly pressureValue?: number | null | undefined;
  readonly temperatureC?: number | undefined;
  readonly calibration?: readonly string[] | undefined;
  readonly calibrationWords?: readonly number[] | undefined;
  readonly easyStart?: number | undefined;
  readonly pacer?: number | undefined;
  readonly transfer?: { readonly sessionId: number; readonly length: number } | undefined;
  readonly recordChunk?: Uint8Array | undefined;
  readonly recordStatus?: number | undefined;
  readonly sensorFrame?: 'imu' | undefined;
}
