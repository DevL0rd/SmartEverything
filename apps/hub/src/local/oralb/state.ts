import {
  oralbActivityOf,
  oralbModeOf,
  oralbRoutineOf,
  oralbSectorsOf,
  type BrushActivity,
  type BrushMode,
  type BrushPressure,
  type LiveSource,
} from '@smarteverything/domain';
import type { OralbDelta } from '@smarteverything/ble';
import type { BrushSnapshot, EndHint, SnapshotHead } from '../toothbrush/brand';

export type Touched = Set<
  | 'activity'
  | 'elapsed'
  | 'pressure'
  | 'battery'
  | 'head'
  | 'extras'
  | 'mode'
  | 'routine'
  | 'ring'
  | 'slots'
  | 'runtime'
>;

export interface HeadReading {
  readonly state: number;
  readonly days: number;
  readonly seconds: number;
}

export interface ObservedRun {
  readonly startedAtMs: number;
  durationS: number;
  mode: BrushMode | null;
}

export interface Applied {
  readonly touched: Touched;
  readonly ended: ObservedRun | null;
}

export type Source = 'advert' | 'link';

const TIMER_FRESH_MS = 3000;

const RUNS_KEPT = 8;

const DEFAULT_ROUTINE_SECONDS = 120;

const SUMMARY_STATES: ReadonlySet<number> = new Set([9, 10]);

const MAX_FACE = 11;

const NO_HEAD: SnapshotHead = { serial: null, type: null, usageS: null, limitS: null };

const PRESSURE_OF: Readonly<Record<number, BrushPressure>> = {
  0: 'no_contact',
  1: 'optimal',
  2: 'too_high',
};

export function isRunning(activity: BrushActivity): boolean {
  return activity === 'brushing' || activity === 'paused';
}

export class OralbState implements BrushSnapshot {
  readonly intensity = null;
  readonly pressureValue = null;
  readonly temperatureC = null;
  readonly sessionId = null;
  readonly head = NO_HEAD;
  readonly faults = null;
  activity: BrushActivity = 'asleep';
  rawState: number | null = null;
  elapsedS = 0;
  routineS: number | null = null;
  mode: BrushMode | null = null;
  pressure: BrushPressure | null = null;
  zone: number | null = null;
  sectorS: number | null = null;
  force: number | null = null;
  angleDeg: number | null = null;
  face: number | null = null;
  battery: number | null = null;
  batteryMillivolts: number | null = null;
  batteryMilliamps: number | null = null;
  batteryC: number | null = null;
  runtimeLeftS: number | null = null;
  liveSource: LiveSource | null = null;
  protocol: number | null = null;
  modelId: number | null = null;
  firmware: number | null = null;
  clock: number | null = null;
  clockAtMs: number | null = null;
  modeSlots: readonly (number | null)[] | null = null;
  pacer: readonly number[] | null = null;
  onPacer: readonly number[] | null = null;
  sectorCount = 0;
  ringDrive: readonly number[] | null = null;
  headReading: HeadReading | null = null;
  headStateCode: number | null = null;
  runningAdverts = 0;
  readonly advertIntervals: number[] = [];
  readonly runs: ObservedRun[] = [];
  private asleep = true;
  private timerAdvancing = false;
  private timerChangedAtMs = 0;
  private faceFromLink = false;
  private lastAdvertAtMs: number | null = null;
  private current: ObservedRun | null = null;
  private seconds: number[] = [];

  get zoneSeconds(): readonly number[] {
    return Array.from({ length: this.sectorCount }, (_, index) => this.seconds[index] ?? 0);
  }

  get endHint(): EndHint | null {
    if (this.rawState === null || !SUMMARY_STATES.has(this.rawState)) {
      return null;
    }
    return this.elapsedS >= (this.routineS ?? DEFAULT_ROUTINE_SECONDS) ? 'complete' : 'aborted';
  }

  seedSchedule(schedule: readonly number[] | null): void {
    if (schedule === null) {
      return;
    }
    this.pacer = schedule;
    this.routineS = oralbRoutineOf(schedule);
    this.onPacer = this.routineS === null ? null : schedule;
    this.sectorCount = oralbSectorsOf(schedule).length;
  }

  resetLink(): void {
    this.faceFromLink = false;
  }

  wake(): void {
    this.asleep = false;
    this.refresh();
  }

  sleep(chargingKept: boolean): boolean {
    this.asleep = true;
    const next: BrushActivity = chargingKept && this.rawState === 4 ? 'charging' : 'asleep';
    const changed = next !== this.activity;
    this.activity = next;
    return changed;
  }

  apply(delta: OralbDelta, atMs: number, source: Source): Applied {
    const touched: Touched = new Set();
    const wasRunning = isRunning(this.activity);
    this.source(source, touched);
    this.applyIdentity(delta, touched);
    this.applyState(delta, atMs, touched);
    this.applyRoutine(delta, touched);
    this.applySector(delta);
    this.applySensors(delta, source, touched);
    this.applyPower(delta, touched);
    this.applyHead(delta, touched);
    this.applyClock(delta, atMs);
    const ended = this.trackRun(wasRunning, atMs);
    this.noteAdvert(atMs, source);
    return { touched, ended };
  }

  private source(source: Source, touched: Touched): void {
    const next: LiveSource = source;
    if (this.liveSource !== next) {
      this.liveSource = next;
      touched.add('extras');
    }
  }

  private refresh(): void {
    if (this.asleep) {
      this.activity = 'asleep';
      return;
    }
    this.activity =
      this.rawState === null ? this.activity : oralbActivityOf(this.rawState, this.timerAdvancing);
  }

  private applyIdentity(delta: OralbDelta, touched: Touched): void {
    const before = [this.protocol, this.modelId, this.firmware].join();
    this.protocol = delta.protocol ?? this.protocol;
    this.modelId = delta.modelId ?? this.modelId;
    this.firmware = delta.firmware ?? this.firmware;
    if ([this.protocol, this.modelId, this.firmware].join() !== before) {
      touched.add('extras');
    }
  }

  private applyState(delta: OralbDelta, atMs: number, touched: Touched): void {
    const elapsedBefore = this.elapsedS;
    if (delta.timerS !== undefined) {
      this.noteTimer(delta.timerS, atMs);
      if (delta.timerS !== elapsedBefore) {
        touched.add('elapsed');
      }
    }
    if (delta.state === undefined && delta.timerS === undefined) {
      return;
    }
    const activityBefore = this.activity;
    const stateBefore = this.rawState;
    this.rawState = delta.state ?? this.rawState;
    this.asleep = false;
    this.refresh();
    if (this.activity !== activityBefore || this.rawState !== stateBefore) {
      touched.add('activity');
    }
  }

  private noteTimer(timerS: number, atMs: number): void {
    if (timerS > this.elapsedS) {
      this.timerChangedAtMs = atMs;
    }
    this.timerAdvancing = atMs - this.timerChangedAtMs <= TIMER_FRESH_MS;
    this.elapsedS = timerS;
  }

  private applyRoutine(delta: OralbDelta, touched: Touched): void {
    const mode = delta.modeId === undefined ? null : oralbModeOf(delta.modeId);
    if (mode !== null && mode !== this.mode) {
      this.mode = mode;
      touched.add('mode');
    }
    if (delta.modeSlots !== undefined) {
      this.modeSlots = delta.modeSlots;
      touched.add('slots');
    }
    if (delta.pacerS !== undefined) {
      this.pacer = delta.pacerS;
      this.routineS = oralbRoutineOf(delta.pacerS);
      this.onPacer = this.routineS === null ? this.onPacer : delta.pacerS;
      this.sectorCount = delta.pacerSectorCount ?? 0;
      touched.add('routine');
    }
    if (delta.ringDrive !== undefined) {
      this.ringDrive = delta.ringDrive;
      touched.add('ring');
    }
  }

  private applySector(delta: OralbDelta): void {
    if (delta.sectorCount !== undefined && this.pacer === null) {
      this.sectorCount = delta.sectorCount;
    }
    if (delta.sector === undefined) {
      return;
    }
    this.zone = this.zoneOf(delta.sector);
    if (isRunning(this.activity)) {
      this.noteSectorSeconds(delta.secondsInSector);
    }
  }

  private zoneOf(sector: NonNullable<OralbDelta['sector']>): number | null {
    const index = sector.last ? this.sectorCount : sector.position;
    return index === null || index < 1 ? null : index;
  }

  private noteSectorSeconds(seconds: number | undefined): void {
    this.sectorS = seconds ?? this.sectorS;
    if (this.zone !== null && this.sectorS !== null && this.zone <= this.sectorCount) {
      this.seconds[this.zone - 1] = this.sectorS;
    }
  }

  private applySensors(delta: OralbDelta, source: Source, touched: Touched): void {
    const running = isRunning(this.activity);
    const pressure = running ? (PRESSURE_OF[delta.pressure ?? -1] ?? this.pressure) : null;
    if (pressure !== this.pressure) {
      this.pressure = pressure;
      touched.add('pressure');
    }
    this.force = running ? this.forceOf(delta) : null;
    this.angleDeg = running ? this.angleOf(delta) : null;
    this.applyFace(delta, source);
  }

  private forceOf(delta: OralbDelta): number | null {
    return delta.forceRaw === undefined ? this.force : Math.max(0, delta.forceRaw) / 1000;
  }

  private angleOf(delta: OralbDelta): number | null {
    return delta.angleCentidegrees === undefined ? this.angleDeg : delta.angleCentidegrees / 100;
  }

  private applyFace(delta: OralbDelta, source: Source): void {
    if (delta.face === undefined || (source === 'advert' && this.faceFromLink)) {
      return;
    }
    this.faceFromLink = this.faceFromLink || source === 'link';
    this.face = Math.min(MAX_FACE, delta.face);
  }

  private applyPower(delta: OralbDelta, touched: Touched): void {
    if (delta.battery !== undefined && delta.battery !== this.battery) {
      this.battery = delta.battery;
      touched.add('battery');
    }
    if (delta.millivolts !== undefined) {
      this.batteryMillivolts = delta.millivolts;
      this.batteryMilliamps = delta.milliamps ?? null;
      this.batteryC = delta.temperatureC ?? null;
      touched.add('battery');
    }
    if (delta.runtimeLeftS !== undefined && delta.runtimeLeftS !== this.runtimeLeftS) {
      this.runtimeLeftS = delta.runtimeLeftS;
      touched.add('runtime');
    }
  }

  private applyHead(delta: OralbDelta, touched: Touched): void {
    if (
      delta.headState === undefined ||
      delta.headDaysLeft === undefined ||
      delta.headSecondsLeft === undefined
    ) {
      return;
    }
    this.headStateCode = delta.headState;
    this.headReading = {
      state: delta.headState,
      days: delta.headDaysLeft,
      seconds: delta.headSecondsLeft,
    };
    touched.add('head');
  }

  private applyClock(delta: OralbDelta, atMs: number): void {
    if (delta.clock !== undefined) {
      this.clock = delta.clock;
      this.clockAtMs = atMs;
    }
  }

  private noteAdvert(atMs: number, source: Source): void {
    if (source !== 'advert') {
      return;
    }
    if (this.rawState === 3) {
      this.runningAdverts += 1;
      if (this.lastAdvertAtMs !== null) {
        this.advertIntervals.push(atMs - this.lastAdvertAtMs);
      }
    }
    this.lastAdvertAtMs = atMs;
  }

  private trackRun(wasRunning: boolean, atMs: number): ObservedRun | null {
    const running = isRunning(this.activity);
    if (!wasRunning && running) {
      this.startRun(atMs);
    }
    const run = this.current;
    if (run !== null && running) {
      run.durationS = Math.max(run.durationS, this.elapsedS);
      run.mode = this.mode;
    }
    if (wasRunning && !running && run !== null) {
      this.current = null;
      this.runs.push(run);
      this.runs.splice(0, Math.max(0, this.runs.length - RUNS_KEPT));
      return run;
    }
    return null;
  }

  private startRun(atMs: number): void {
    this.current = {
      startedAtMs: atMs - this.elapsedS * 1000,
      durationS: this.elapsedS,
      mode: this.mode,
    };
    this.seconds = [];
    this.face = null;
    this.faceFromLink = false;
    this.runningAdverts = 0;
    this.advertIntervals.length = 0;
    this.lastAdvertAtMs = null;
  }
}
