import type { OralbRecord } from './record';

export interface OralbSector {
  readonly position: number | null;
  readonly last: boolean;
}

export interface OralbDelta {
  readonly protocol?: number | undefined;
  readonly modelId?: number | undefined;
  readonly firmware?: number | undefined;
  readonly mac?: string | undefined;
  readonly userId?: number | undefined;
  readonly state?: number | undefined;
  readonly substate?: number | undefined;
  readonly statusBits?: number | undefined;
  readonly pressure?: number | undefined;
  readonly forceRaw?: number | undefined;
  readonly angleCentidegrees?: number | undefined;
  readonly driveTarget?: number | undefined;
  readonly pressureStamp?: number | undefined;
  readonly pressureId?: number | undefined;
  readonly powerButton?: boolean | undefined;
  readonly modeButton?: boolean | undefined;
  readonly modeId?: number | undefined;
  readonly timerS?: number | undefined;
  readonly sector?: OralbSector | undefined;
  readonly secondsInSector?: number | undefined;
  readonly sectorCount?: number | undefined;
  readonly face?: number | undefined;
  readonly battery?: number | undefined;
  readonly runtimeLeftS?: number | null | undefined;
  readonly millivolts?: number | undefined;
  readonly milliamps?: number | null | undefined;
  readonly temperatureC?: number | undefined;
  readonly clock?: number | undefined;
  readonly modeSlots?: readonly (number | null)[] | undefined;
  readonly pacerS?: readonly number[] | undefined;
  readonly pacerSectorCount?: number | undefined;
  readonly pacerTargetS?: number | undefined;
  readonly ringDrive?: readonly [number, number, number, number] | undefined;
  readonly headState?: number | undefined;
  readonly headDaysLeft?: number | undefined;
  readonly headSecondsLeft?: number | undefined;
  readonly record?: OralbRecord | undefined;
}
