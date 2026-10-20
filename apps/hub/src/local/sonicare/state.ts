import {
  BRUSH_INTENSITIES,
  zoneAt,
  type BrushActivity,
  type BrushHead,
  type BrushHeadType,
  type BrushIntensity,
  type BrushMode,
  type BrushPressure,
  type SonicareProfile,
} from '@smarteverything/domain';
import {
  resolveMode,
  type BrushDelta,
  type BrushingStateName,
  type HandleStateName,
} from '@smarteverything/ble';
import type { BrushSnapshot, EndHint } from '../toothbrush/brand';

export interface HeadFacts {
  serial: string | null | undefined;
  type: BrushHeadType | null;
  usageS: number | null;
  limitS: number | null;
  made: string | null;
  ring: number | null;
}

export interface Extras {
  firmware: string | null;
  serial: string | null;
  model: string | null;
  nfcVersion: string | null;
  nfcUrl: string | null;
  calibration: readonly string[];
  easyStart: number | null;
  sensorMask: number | null;
  settingsBits: number | null;
  errorPersistent: number | null;
  errorVolatile: number | null;
}

export type Touched = Set<
  | 'activity'
  | 'mode'
  | 'intensity'
  | 'battery'
  | 'head'
  | 'errors'
  | 'elapsed'
  | 'pressure'
  | 'temperature'
  | 'storage'
  | 'motor'
  | 'settings'
  | 'routine'
  | 'extras'
>;

function intensityOf(code: number): BrushIntensity | null {
  return BRUSH_INTENSITIES[code] ?? null;
}

const HANDLE_ACTIVITY: Readonly<Record<HandleStateName, BrushActivity>> = {
  off: 'off',
  standby: 'standby',
  run: 'brushing',
  charge: 'charging',
  shutdown: 'off',
  validate: 'standby',
  background: 'standby',
};

const RUN_ACTIVITY: Readonly<Record<BrushingStateName, BrushActivity>> = {
  on: 'brushing',
  pause: 'paused',
  off: 'standby',
  complete: 'standby',
  aborted: 'standby',
};

function activityOf(
  handle: HandleStateName | null,
  brushing: BrushingStateName | null,
): BrushActivity | null {
  if (handle === null) {
    return null;
  }
  const base = HANDLE_ACTIVITY[handle];
  return base === 'brushing' ? RUN_ACTIVITY[brushing ?? 'on'] : base;
}

export class BrushState implements BrushSnapshot {
  handleState: HandleStateName | null = null;
  brushingState: BrushingStateName | null = null;
  readonly zoneSeconds: readonly number[] = [];
  readonly sectorS = null;
  readonly force = null;
  readonly angleDeg = null;
  readonly face = null;
  readonly liveSource = null;
  asleep = true;
  activity: BrushActivity = 'asleep';
  mode: BrushMode | null = null;
  modePosition: number | null = null;
  modeRoutineId: number | null = null;
  routineIds: readonly number[] | null = null;
  intensity: BrushIntensity | null = null;
  elapsedS = 0;
  routineS: number | null = null;
  sessionId: number | null = null;
  battery: number | null = null;
  batteryMillivolts: number | null = null;
  pressure: BrushPressure | null = null;
  rawPressureValue: number | null = null;
  rawTemperatureC: number | null = null;
  latestStoredId: number | null = null;
  storedCount: number | null = null;
  motorSeconds: number | null = null;
  handleClock: number | null = null;
  handleClockAtMs: number | null = null;
  head: HeadFacts = {
    serial: undefined,
    type: null,
    usageS: null,
    limitS: null,
    made: null,
    ring: null,
  };
  extras: Extras = {
    firmware: null,
    serial: null,
    model: null,
    nfcVersion: null,
    nfcUrl: null,
    calibration: [],
    easyStart: null,
    sensorMask: null,
    settingsBits: null,
    errorPersistent: null,
    errorVolatile: null,
  };

  constructor(
    private readonly profile: SonicareProfile,
    private readonly model: string | null,
  ) {}

  get pressureValue(): number | null {
    return this.profile.pressure === 'value' ? this.rawPressureValue : null;
  }

  get temperatureC(): number | null {
    return this.profile.temperature ? this.rawTemperatureC : null;
  }

  get zone(): number | null {
    return this.mode === null || this.routineS === null
      ? null
      : zoneAt(this.mode, this.profile.zones, this.elapsedS, this.routineS);
  }

  get endHint(): EndHint | null {
    return this.brushingState === 'complete' || this.brushingState === 'aborted'
      ? this.brushingState
      : null;
  }

  get faults(): readonly (number | null)[] {
    return [this.extras.errorPersistent, this.extras.errorVolatile];
  }

  apply(delta: BrushDelta, atMs: number): Touched {
    const touched: Touched = new Set();
    this.applyHandle(delta, touched);
    this.applyRoutine(delta, touched);
    this.applyPower(delta, touched);
    this.applyHead(delta, touched);
    this.applySensors(delta, touched);
    this.applyStorage(delta, atMs, touched);
    this.applyExtras(delta, touched);
    return touched;
  }

  sleep(chargingKept: boolean): boolean {
    this.asleep = true;
    const next: BrushActivity =
      chargingKept && this.handleState === 'charge' ? 'charging' : 'asleep';
    const changed = next !== this.activity;
    this.activity = next;
    return changed;
  }

  wake(): void {
    this.asleep = false;
    this.refreshActivity();
  }

  headState(brushedSeconds: number, graceSeconds: number): BrushHead | null {
    const { serial } = this.head;
    if (serial === undefined) {
      return null;
    }
    if (serial !== null) {
      return 'fitted';
    }
    return brushedSeconds >= graceSeconds || this.head.type === 'other'
      ? 'unrecognised'
      : 'missing';
  }

  private applyHandle(delta: BrushDelta, touched: Touched): void {
    if (delta.handleState === undefined && delta.brushingState === undefined) {
      return;
    }
    this.handleState = delta.handleState === undefined ? this.handleState : delta.handleState;
    this.brushingState =
      delta.brushingState === undefined ? this.brushingState : delta.brushingState;
    this.asleep = false;
    this.refreshActivity();
    touched.add('activity');
  }

  private refreshActivity(): void {
    const next = this.asleep ? 'asleep' : activityOf(this.handleState, this.brushingState);
    this.activity = next ?? this.activity;
  }

  private applyRoutine(delta: BrushDelta, touched: Touched): void {
    this.applyMode(delta, touched);
    if (delta.intensity !== undefined) {
      this.intensity = intensityOf(delta.intensity);
      touched.add('intensity');
    }
    if (delta.routineS !== undefined) {
      this.routineS = delta.routineS;
      touched.add('routine');
    }
    if (delta.elapsedS !== undefined) {
      this.elapsedS = delta.elapsedS;
      touched.add('elapsed');
    }
    this.sessionId = delta.sessionId ?? this.sessionId;
  }

  private applyMode(delta: BrushDelta, touched: Touched): void {
    this.routineIds = delta.routineIds ?? this.routineIds;
    this.modeRoutineId = delta.modeRoutineId ?? this.modeRoutineId;
    this.modePosition = delta.modePosition ?? this.modePosition;
    const changed =
      delta.routineIds !== undefined ||
      delta.modeRoutineId !== undefined ||
      delta.modePosition !== undefined;
    if (changed) {
      this.resolve();
      touched.add('mode');
    }
  }

  private resolve(): void {
    this.mode = resolveMode({
      selectsById: this.profile.writes,
      routineId: this.modeRoutineId,
      position: this.modePosition,
      routineIds: this.profile.writes ? null : this.routineIds,
      model: this.model,
    });
  }

  private applyPower(delta: BrushDelta, touched: Touched): void {
    if (delta.battery !== undefined) {
      this.battery = delta.battery;
      touched.add('battery');
    }
    if (delta.batteryMillivolts !== undefined) {
      this.batteryMillivolts = delta.batteryMillivolts;
      touched.add('battery');
    }
    if (delta.errorPersistent !== undefined || delta.errorVolatile !== undefined) {
      touched.add('errors');
    }
    if (delta.motorSeconds !== undefined) {
      this.motorSeconds = delta.motorSeconds;
      touched.add('motor');
    }
  }

  private applyHead(delta: BrushDelta, touched: Touched): void {
    const next: HeadFacts = { ...this.head };
    if (delta.headSerial !== undefined) {
      next.serial = delta.headSerial;
    }
    if (delta.headType !== undefined) {
      next.type = delta.headType;
    }
    if (delta.headUsageS !== undefined) {
      next.usageS = delta.headUsageS;
    }
    if (delta.headLimitS !== undefined) {
      next.limitS = delta.headLimitS;
    }
    if (delta.headMade !== undefined) {
      next.made = delta.headMade;
    }
    if (delta.headRing !== undefined) {
      next.ring = delta.headRing;
    }
    if (JSON.stringify(next) !== JSON.stringify(this.head)) {
      this.head = next;
      touched.add('head');
    }
  }

  private applySensors(delta: BrushDelta, touched: Touched): void {
    if (delta.pressure !== undefined) {
      this.pressure = delta.pressure;
      touched.add('pressure');
    }
    if (delta.pressureValue !== undefined) {
      this.rawPressureValue = delta.pressureValue;
    }
    if (delta.temperatureC !== undefined) {
      this.rawTemperatureC = delta.temperatureC;
      touched.add('temperature');
    }
  }

  private applyStorage(delta: BrushDelta, atMs: number, touched: Touched): void {
    if (delta.latestStoredId !== undefined) {
      this.latestStoredId = delta.latestStoredId;
      touched.add('storage');
    }
    if (delta.storedCount !== undefined) {
      this.storedCount = delta.storedCount;
      touched.add('storage');
    }
    if (delta.handleClock !== undefined) {
      this.handleClock = delta.handleClock;
      this.handleClockAtMs = atMs;
    }
  }

  private applyExtras(delta: BrushDelta, touched: Touched): void {
    const before = JSON.stringify(this.extras);
    this.extras = {
      ...this.identityExtras(delta),
      ...this.headExtras(delta),
      ...this.settingExtras(delta),
    };
    if (JSON.stringify(this.extras) !== before) {
      touched.add('extras');
    }
    if (delta.settingsBits !== undefined) {
      touched.add('settings');
    }
  }

  private identityExtras(delta: BrushDelta): Pick<Extras, 'firmware' | 'serial' | 'model'> {
    return {
      firmware: delta.firmware ?? this.extras.firmware,
      serial: delta.serial ?? this.extras.serial,
      model: delta.model ?? this.extras.model,
    };
  }

  private headExtras(delta: BrushDelta): Pick<Extras, 'nfcVersion' | 'nfcUrl' | 'calibration'> {
    return {
      nfcVersion: delta.nfcVersion ?? this.extras.nfcVersion,
      nfcUrl: delta.nfcUrl ?? this.extras.nfcUrl,
      calibration: delta.calibration ?? this.extras.calibration,
    };
  }

  private settingExtras(
    delta: BrushDelta,
  ): Pick<
    Extras,
    'easyStart' | 'sensorMask' | 'settingsBits' | 'errorPersistent' | 'errorVolatile'
  > {
    return {
      easyStart: delta.easyStart ?? this.extras.easyStart,
      sensorMask: delta.sensorMask ?? this.extras.sensorMask,
      settingsBits: delta.settingsBits ?? this.extras.settingsBits,
      errorPersistent: delta.errorPersistent ?? this.extras.errorPersistent,
      errorVolatile: delta.errorVolatile ?? this.extras.errorVolatile,
    };
  }
}
