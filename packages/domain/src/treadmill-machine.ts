import { calorieRate } from './treadmill-calories';
import type { MachineStatus, TreadmillInput, TreadmillReading } from './treadmill-reading';
import type { SessionZoneSeconds, TreadmillSession } from './treadmill-sessions';
import { zoneOf, type BeltMode, type BeltState, type PanelButton } from './treadmill';

const LINK_GAP_SECONDS = 10;

const COUNTER_RESET_SECONDS = 3;

const METRES_PER_KM = 1000;

const SPEED_CHANGE_KMH = 1;

const INTERVAL_SWING_KMH = 3;

const INTERVAL_CHANGES = 4;

const INTERVAL_ZONE_SHARE = 0.2;

export interface MachineSettings {
  readonly weightKg: number | null;
  readonly gradePercent: number;
  readonly runSwitchKmh: number;
}

type StatusMemory = 'started' | 'stopped' | 'paused' | 'safety' | null;

export type SessionSummary = Pick<
  TreadmillSession,
  | 'startedAt'
  | 'endedAt'
  | 'activeSeconds'
  | 'pausedSeconds'
  | 'distanceM'
  | 'steps'
  | 'kcal'
  | 'kcalNet'
  | 'avgKmh'
  | 'maxKmh'
  | 'mode'
  | 'kind'
  | 'zones'
  | 'splits'
>;

interface OpenSession {
  readonly startedAt: string;
  readonly mode: BeltMode | null;
  readonly lastAt: string;
  readonly lastTimeS: number;
  readonly lastDistanceM: number;
  readonly steps: number | null;
  readonly activeSeconds: number;
  readonly pausedSeconds: number;
  readonly zones: SessionZoneSeconds;
  readonly kcal: number | null;
  readonly kcalNet: number | null;
  readonly maxKmh: number;
  readonly minKmh: number;
  readonly splits: readonly number[];
  readonly lastSplitTimeS: number;
  readonly lastKmh: number;
  readonly changes: number;
}

export interface MachineState {
  readonly state: BeltState;
  readonly memory: StatusMemory;
  readonly live: TreadmillReading;
  readonly open: OpenSession | null;
}

export type MachineEvent =
  | { readonly kind: 'started'; readonly at: string; readonly mode: BeltMode | null }
  | { readonly kind: 'paused'; readonly at: string }
  | { readonly kind: 'resumed'; readonly at: string }
  | { readonly kind: 'finished'; readonly at: string; readonly summary: SessionSummary }
  | {
      readonly kind: 'state_changed';
      readonly at: string;
      readonly from: BeltState;
      readonly to: BeltState;
    }
  | { readonly kind: 'safety_stop'; readonly at: string }
  | { readonly kind: 'control_lost'; readonly at: string }
  | { readonly kind: 'button'; readonly at: string; readonly button: PanelButton }
  | {
      readonly kind: 'speed_changed';
      readonly at: string;
      readonly from: number;
      readonly to: number;
    };

export interface MachineStep {
  readonly state: MachineState;
  readonly events: readonly MachineEvent[];
}

export function initialMachine(): MachineState {
  return { state: 'idle', memory: null, live: {}, open: null };
}

function secondsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 1000;
}

function inferState(memory: StatusMemory, previous: BeltState, speedKmh: number): BeltState {
  switch (memory) {
    case 'safety':
      return 'safety_stop';
    case 'paused':
      return 'paused';
    case 'stopped':
      return 'stopped';
    case 'started':
      return speedKmh > 0 ? 'running' : 'countdown';
    case null:
      if (speedKmh > 0) {
        return 'running';
      }
      return previous === 'standby' || previous === 'fault' ? previous : 'idle';
  }
}

function memoryOf(status: MachineStatus, memory: StatusMemory): StatusMemory {
  switch (status.kind) {
    case 'reset':
      return null;
    case 'stopped':
      return 'stopped';
    case 'paused':
      return 'paused';
    case 'safety_stop':
      return 'safety';
    case 'started':
      return 'started';
    case 'target_speed':
    case 'target_incline':
    case 'control_lost':
    case 'other':
      return memory;
  }
}

function emptyZones(): SessionZoneSeconds {
  return { walk: 0, jog: 0, run: 0 };
}

function begin(at: string, live: TreadmillReading, settings: MachineSettings): OpenSession {
  const timeS = live.timeS ?? 0;
  const speed = live.speedKmh ?? 0;
  return {
    startedAt: new Date(Date.parse(at) - timeS * 1000).toISOString(),
    mode: live.mode ?? null,
    lastAt: at,
    lastTimeS: timeS,
    lastDistanceM: live.distanceM ?? 0,
    steps: live.steps ?? null,
    activeSeconds: timeS,
    pausedSeconds: 0,
    zones: emptyZones(),
    kcal: settings.weightKg === null ? null : 0,
    kcalNet: settings.weightKg === null ? null : 0,
    maxKmh: speed,
    minKmh: speed,
    splits: [],
    lastSplitTimeS: 0,
    lastKmh: speed,
    changes: 0,
  };
}

function crossedSplits(open: OpenSession, distanceM: number, timeS: number): OpenSession {
  const kmBefore = Math.floor(open.lastDistanceM / METRES_PER_KM);
  const kmAfter = Math.floor(distanceM / METRES_PER_KM);
  if (kmAfter <= kmBefore || distanceM <= open.lastDistanceM) {
    return open;
  }
  const splits = [...open.splits];
  let previousTime = open.lastSplitTimeS;
  for (let km = kmBefore + 1; km <= kmAfter; km += 1) {
    const share = (km * METRES_PER_KM - open.lastDistanceM) / (distanceM - open.lastDistanceM);
    const crossed = open.lastTimeS + share * (timeS - open.lastTimeS);
    splits.push(Math.max(crossed - previousTime, 1));
    previousTime = crossed;
  }
  return { ...open, splits, lastSplitTimeS: previousTime };
}

function energy(
  open: OpenSession,
  speedKmh: number,
  seconds: number,
  settings: MachineSettings,
): Pick<OpenSession, 'kcal' | 'kcalNet'> {
  if (settings.weightKg === null || open.kcal === null || open.kcalNet === null) {
    return { kcal: open.kcal, kcalNet: open.kcalNet };
  }
  const rate = calorieRate({
    speedKmh,
    gradePercent: settings.gradePercent,
    weightKg: settings.weightKg,
    runSwitchKmh: settings.runSwitchKmh,
  });
  return {
    kcal: open.kcal + (rate.grossPerMinute * seconds) / 60,
    kcalNet: open.kcalNet + (rate.netPerMinute * seconds) / 60,
  };
}

function advanceRunning(
  open: OpenSession,
  live: TreadmillReading,
  at: string,
  settings: MachineSettings,
): OpenSession {
  const speed = live.speedKmh ?? open.lastKmh;
  const timeS = live.timeS ?? open.lastTimeS + secondsBetween(open.lastAt, at);
  const elapsed = Math.max(timeS - open.lastTimeS, 0);
  const distanceM = live.distanceM ?? open.lastDistanceM;
  const split = crossedSplits(open, distanceM, timeS);
  const zone = zoneOf(speed);
  return {
    ...split,
    ...energy(open, speed, elapsed, settings),
    lastAt: at,
    lastTimeS: timeS,
    lastDistanceM: distanceM,
    steps: live.steps ?? open.steps,
    activeSeconds: Math.max(timeS, open.activeSeconds),
    zones: { ...open.zones, [zone]: open.zones[zone] + elapsed },
    maxKmh: Math.max(open.maxKmh, speed),
    minKmh: Math.min(open.minKmh, speed),
    lastKmh: speed,
    changes: open.changes + (Math.abs(speed - open.lastKmh) >= SPEED_CHANGE_KMH ? 1 : 0),
  };
}

function advancePaused(open: OpenSession, at: string): OpenSession {
  return {
    ...open,
    lastAt: at,
    pausedSeconds: open.pausedSeconds + secondsBetween(open.lastAt, at),
  };
}

function kindOf(open: OpenSession, mode: BeltMode | null): TreadmillSession['kind'] {
  const total = open.zones.walk + open.zones.jog + open.zones.run;
  const shares = [open.zones.walk, open.zones.jog, open.zones.run].filter(
    (seconds) => total > 0 && seconds / total >= INTERVAL_ZONE_SHARE,
  );
  const swing = open.maxKmh - open.minKmh;
  if (
    mode === 'hiit' ||
    (swing >= INTERVAL_SWING_KMH && open.changes >= INTERVAL_CHANGES && shares.length >= 2)
  ) {
    return 'intervals';
  }
  if (open.zones.run >= open.zones.jog && open.zones.run >= open.zones.walk && open.zones.run > 0) {
    return 'run';
  }
  return open.zones.jog > open.zones.walk ? 'jog' : 'walk';
}

function summaryOf(open: OpenSession, endedAt: string): SessionSummary {
  const hours = open.activeSeconds / 3600;
  return {
    startedAt: open.startedAt,
    endedAt,
    activeSeconds: open.activeSeconds,
    pausedSeconds: open.pausedSeconds,
    distanceM: open.lastDistanceM,
    steps: open.steps,
    kcal: open.kcal,
    kcalNet: open.kcalNet,
    avgKmh: hours > 0 ? open.lastDistanceM / METRES_PER_KM / hours : 0,
    maxKmh: open.maxKmh,
    mode: open.mode,
    kind: kindOf(open, open.mode),
    zones: open.zones,
    splits: [...open.splits],
  };
}

export function openSummary(state: MachineState, at: string): SessionSummary | null {
  return state.open === null ? null : summaryOf(state.open, at);
}

function finishing(open: OpenSession, at: string, endedAt: string): MachineEvent {
  return { kind: 'finished', at, summary: summaryOf(open, endedAt) };
}

function counterReset(open: OpenSession, live: TreadmillReading): boolean {
  return live.timeS !== undefined && live.timeS < open.lastTimeS - COUNTER_RESET_SECONDS;
}

interface Moment {
  readonly at: string;
  readonly live: TreadmillReading;
  readonly settings: MachineSettings;
}

interface Evolution {
  readonly open: OpenSession | null;
  readonly events: readonly MachineEvent[];
}

function running(open: OpenSession | null, previous: BeltState, moment: Moment): Evolution {
  if (open === null) {
    const created = begin(moment.at, moment.live, moment.settings);
    return { open: created, events: [{ kind: 'started', at: moment.at, mode: created.mode }] };
  }
  const resumed: MachineEvent[] = previous === 'paused' ? [{ kind: 'resumed', at: moment.at }] : [];
  return {
    open: advanceRunning(open, moment.live, moment.at, moment.settings),
    events: resumed,
  };
}

function evolve(
  open: OpenSession | null,
  previous: BeltState,
  next: BeltState,
  moment: Moment,
): Evolution {
  if (next === 'running') {
    return running(open, previous, moment);
  }
  if (open === null) {
    return { open: null, events: [] };
  }
  if (next === 'paused') {
    const paused: MachineEvent[] = previous === 'paused' ? [] : [{ kind: 'paused', at: moment.at }];
    return { open: advancePaused(open, moment.at), events: paused };
  }
  if (next === 'countdown' && previous === 'paused') {
    return { open: advancePaused(open, moment.at), events: [{ kind: 'resumed', at: moment.at }] };
  }
  const advanced =
    moment.live.timeS === undefined
      ? open
      : advanceRunning(open, moment.live, moment.at, moment.settings);
  const gap = secondsBetween(open.lastAt, moment.at) > LINK_GAP_SECONDS;
  const worked = Math.max(advanced.lastTimeS - open.lastTimeS, 0);
  const endedAt = gap ? new Date(Date.parse(open.lastAt) + worked * 1000).toISOString() : moment.at;
  return { open: null, events: [finishing(advanced, moment.at, endedAt)] };
}

function transition(before: MachineState, next: BeltState, moment: Moment): MachineStep {
  const events: MachineEvent[] = [];
  if (next !== before.state) {
    events.push({ kind: 'state_changed', at: moment.at, from: before.state, to: next });
  }
  const closing =
    before.open !== null && next === 'running' && counterReset(before.open, moment.live)
      ? before.open
      : null;
  if (closing !== null) {
    events.push(finishing(closing, closing.lastAt, closing.lastAt));
  }
  const evolution = evolve(closing === null ? before.open : null, before.state, next, moment);
  return {
    state: { ...before, state: next, live: moment.live, open: evolution.open },
    events: [...events, ...evolution.events],
  };
}

function liveAfterStatus(live: TreadmillReading, status: MachineStatus): TreadmillReading {
  if (status.kind === 'target_speed') {
    return { ...live, targetSpeedKmh: status.kmh };
  }
  return status.kind === 'target_incline'
    ? { ...live, targetInclinePercent: status.percent }
    : live;
}

function applyStatus(
  before: MachineState,
  at: string,
  status: MachineStatus,
  settings: MachineSettings,
): MachineStep {
  const memory = memoryOf(status, before.memory);
  const live = liveAfterStatus(before.live, status);
  const marked = { ...before, memory, live };
  const extra: MachineEvent[] = [];
  if (status.kind === 'safety_stop') {
    extra.push({ kind: 'safety_stop', at });
  }
  if (status.kind === 'control_lost') {
    extra.push({ kind: 'control_lost', at });
  }
  if (memory === before.memory) {
    return { state: marked, events: extra };
  }
  const next = inferState(memory, before.state, live.speedKmh ?? 0);
  const moved = transition(marked, next, { at, live, settings });
  return { state: moved.state, events: [...moved.events, ...extra] };
}

function applyReading(
  before: MachineState,
  at: string,
  reading: TreadmillReading,
  settings: MachineSettings,
): MachineStep {
  const live = { ...before.live, ...reading };
  const next = reading.state ?? inferState(before.memory, before.state, live.speedKmh ?? 0);
  const moved = transition(before, next, { at, live, settings });
  const extra: MachineEvent[] = [];
  if (
    before.live.speedKmh !== undefined &&
    reading.speedKmh !== undefined &&
    reading.speedKmh !== before.live.speedKmh &&
    before.state === 'running' &&
    next === 'running'
  ) {
    extra.push({ kind: 'speed_changed', at, from: before.live.speedKmh, to: reading.speedKmh });
  }
  if (reading.button !== undefined && reading.button !== before.live.button) {
    extra.push({ kind: 'button', at, button: reading.button });
  }
  return { state: moved.state, events: [...moved.events, ...extra] };
}

export function stepMachine(
  before: MachineState,
  input: TreadmillInput,
  settings: MachineSettings,
): MachineStep {
  return input.kind === 'machine_status'
    ? applyStatus(before, input.at, input.status, settings)
    : applyReading(before, input.at, input.reading, settings);
}
