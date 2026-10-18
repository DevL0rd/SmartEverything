import {
  LAUNDRY_PHASE_WORDS,
  LaundryValueError,
  doorLine,
  formatLaundryMinutes,
  isLaundryRunning,
  laundryFault,
  laundryPhase,
  laundryProgramByRaw,
  laundryReadiness,
  laundryRunPhase,
  reportedFault,
  type JsonValue,
  type LaundryFaultAdvice,
  type LaundryPhase,
} from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';
import { clock, MINUTE_MS } from '../../../format/time';
import type { LaundrySnapshot } from './snapshot';

type LaundryKey = LaundryPhase | 'fault' | 'open';

export interface LaundryState {
  readonly key: LaundryKey;
  readonly phase: LaundryPhase;
  readonly underlying: LaundryPhase;
  readonly offline: boolean;
  readonly running: boolean;
  readonly remaining: number | null;
  readonly doneAt: string | null;
  readonly startsAt: string | null;
  readonly finishedAt: string | null;
  readonly finishedMs: number | null;
  readonly program: string | null;
  readonly rpm: number | null;
  readonly fault: LaundryFaultAdvice | null;
  readonly word: string;
  readonly line: string;
  readonly short: string;
  readonly left: string | null;
  readonly door: string | null;
  readonly tone: Tone;
  readonly readiness: string | null;
  readonly resting: boolean;
  readonly startable: boolean;
  readonly startLabel: string;
}

const RESTING: ReadonlySet<LaundryKey> = new Set([
  'off',
  'idle',
  'open',
  'finished',
  'drum_clean_done',
]);

const RESTARTS: ReadonlySet<LaundryKey> = new Set(['finished', 'drum_clean_done']);

const QUIET_SUFFIX: ReadonlySet<LaundryKey> = new Set(['idle', 'finished']);

const POSITIVE: ReadonlySet<LaundryKey> = new Set(['finished', 'drum_clean_done', 'anti_crease']);

function guarded<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof LaundryValueError) {
      return fallback;
    }
    throw error;
  }
}

function numberOf(value: JsonValue | undefined): number | null {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function msOf(stamp: string | null): number | null {
  if (stamp === null) {
    return null;
  }
  const at = Date.parse(stamp);
  return Number.isNaN(at) ? null : at;
}

function clockAfter(stamp: string | null, minutes: number | null): string | null {
  if (stamp === null || minutes === null) {
    return null;
  }
  const at = Date.parse(stamp);
  return Number.isNaN(at) ? null : clock(at + minutes * MINUTE_MS);
}

interface Timing {
  readonly startsAt: string | null;
  readonly doneAt: string | null;
}

const NO_TIMING: Timing = { startsAt: null, doneAt: null };

function delayTiming(snapshot: LaundrySnapshot, remaining: number | null): Timing {
  const { values, stamps } = snapshot;
  const wait = numberOf(values.delay_minutes);
  if (remaining === null || wait === null) {
    return NO_TIMING;
  }
  const finishing = values.delay_mode === 'Finish Wash';
  return {
    startsAt: clockAfter(stamps.delay, finishing ? wait - remaining : wait),
    doneAt: clockAfter(stamps.delay, finishing ? wait : wait + remaining),
  };
}

function keyOf(phase: LaundryPhase, fault: string | null, door: JsonValue | undefined): LaundryKey {
  if (fault !== null) {
    return 'fault';
  }
  return door === 'Open' ? 'open' : phase;
}

function underlyingOf(phase: LaundryPhase, snapshot: LaundrySnapshot): LaundryPhase {
  if (phase !== 'paused') {
    return phase;
  }
  const run = guarded(() => laundryRunPhase(snapshot.values), null);
  return run === null || run === 'delayed' ? 'idle' : run;
}

function toneOf(key: LaundryKey, running: boolean, offline: boolean): Tone {
  if (offline) {
    return 'variant';
  }
  if (key === 'fault') {
    return 'critical';
  }
  if (POSITIVE.has(key)) {
    return 'positive';
  }
  if (key === 'paused') {
    return 'warning';
  }
  return running ? 'primary' : 'variant';
}

function wordOf(key: LaundryKey, startsAt: string | null): string {
  if (key === 'fault') {
    return 'Fault';
  }
  if (key === 'open') {
    return 'Door open';
  }
  if (key === 'delayed' && startsAt !== null) {
    return `Starts ${startsAt}`;
  }
  return LAUNDRY_PHASE_WORDS[key];
}

interface Pieces {
  readonly key: LaundryKey;
  readonly online: boolean;
  readonly word: string;
  readonly left: string | null;
  readonly rpm: number | null;
  readonly program: string | null;
  readonly timing: Timing;
  readonly finishedAt: string | null;
  readonly finishedMs: number | null;
  readonly fault: LaundryFaultAdvice | null;
  readonly was: string;
  readonly remoteOff: boolean;
  readonly childLock: boolean;
  readonly detergentLow: boolean;
}

type Line = (pieces: Pieces) => string;

function after(pieces: Pieces, joiner: string, tail: string | null): string {
  return tail === null ? pieces.word : `${pieces.word}${joiner}${tail}`;
}

const REST_LINES: Readonly<Partial<Record<LaundryKey, Line>>> = {
  idle: (pieces) => after(pieces, ' · ', pieces.program),
  delayed: (pieces) => after(pieces, ' · done ', pieces.timing.doneAt),
  finished: (pieces) => after(pieces, ' ', pieces.finishedAt),
  anti_crease: () => 'Done · tumbling to prevent creases',
  paused: (pieces) => (pieces.left === null ? pieces.word : `${pieces.word} · ${pieces.left} left`),
  fault: (pieces) => `Fault · ${pieces.fault?.title ?? 'Machine fault'}`,
};

function cycleLine(pieces: Pieces): string {
  const { word, left, rpm } = pieces;
  if (left === null) {
    return word;
  }
  return pieces.key === 'spin' && rpm !== null
    ? `${word} · ${String(rpm)} rpm · ${left}`
    : `${word} · ${left}`;
}

function suffixOf(pieces: Pieces): string {
  if (!pieces.online || !QUIET_SUFFIX.has(pieces.key)) {
    return '';
  }
  return `${pieces.childLock ? ' · Child lock' : ''}${pieces.detergentLow ? ' · Detergent low' : ''}`;
}

function lineOf(pieces: Pieces, running: boolean): string {
  if (!pieces.online) {
    return `Offline · was ${pieces.was}`;
  }
  if (pieces.key === 'idle' && pieces.remoteOff) {
    return 'Remote off';
  }
  const base = running ? cycleLine(pieces) : (REST_LINES[pieces.key]?.(pieces) ?? pieces.word);
  return `${base}${suffixOf(pieces)}`;
}

function idleShort(pieces: Pieces): string {
  if (pieces.remoteOff) {
    return 'Remote off';
  }
  if (pieces.detergentLow) {
    return 'Ready · Detergent low';
  }
  return pieces.childLock ? 'Ready · Child lock' : 'Ready';
}

const SHORT_LINES: Readonly<Partial<Record<LaundryKey, Line>>> = {
  spin: (pieces) => after(pieces, ' · ', pieces.left),
  delayed: (pieces) =>
    pieces.timing.startsAt === null ? pieces.word : `Starts ${pieces.timing.startsAt}`,
  anti_crease: () => 'Done · anti-crease',
  fault: (pieces) => pieces.fault?.title ?? 'Machine fault',
  finished: (pieces) => after(pieces, ' ', pieces.finishedAt),
  idle: idleShort,
};

function shortOf(pieces: Pieces, line: string): string {
  if (!pieces.online) {
    return `Offline · ${pieces.was}`;
  }
  return SHORT_LINES[pieces.key]?.(pieces) ?? line;
}

function doorOf(snapshot: LaundrySnapshot, key: LaundryKey, phase: LaundryPhase): string | null {
  const door = snapshot.values.door_state;
  if (key === 'open') {
    return 'Door open';
  }
  return typeof door === 'string' ? guarded(() => doorLine(door, phase), null) : null;
}

function finishOf(
  key: LaundryKey,
  stamp: string | null,
): Pick<Pieces, 'finishedAt' | 'finishedMs'> {
  return key === 'finished'
    ? { finishedAt: clockAfter(stamp, 0), finishedMs: msOf(stamp) }
    : { finishedAt: null, finishedMs: null };
}

function flagsOf(
  values: LaundrySnapshot['values'],
): Pick<Pieces, 'remoteOff' | 'childLock' | 'detergentLow'> {
  return {
    remoteOff: values.remote_control === false,
    childLock: values.child_lock === true,
    detergentLow: values.detergent_level === 'Low',
  };
}

function piecesOf(
  snapshot: LaundrySnapshot,
  key: LaundryKey,
  underlying: LaundryPhase,
  timed: boolean,
): Pieces {
  const { values, stamps } = snapshot;
  const remaining = numberOf(values.remaining_minutes);
  const fault = guarded(() => laundryFault(values), null);
  const timing =
    key === 'delayed'
      ? delayTiming(snapshot, remaining)
      : { startsAt: null, doneAt: timed ? clockAfter(stamps.remaining, remaining) : null };
  const program = typeof values.laundry_program === 'string' ? values.laundry_program : null;
  return {
    key,
    online: snapshot.online,
    word: wordOf(key, timing.startsAt),
    left: remaining === null ? null : formatLaundryMinutes(remaining),
    rpm: numberOf(values.spin_speed),
    program: program === null ? null : (laundryProgramByRaw(program)?.label ?? null),
    timing,
    ...finishOf(key, stamps.status),
    fault: fault === null ? null : reportedFault(fault),
    was: LAUNDRY_PHASE_WORDS[underlying],
    ...flagsOf(values),
  };
}

export function laundryStateOf(snapshot: LaundrySnapshot): LaundryState {
  const { values } = snapshot;
  const phase = guarded(() => laundryPhase(values), null) ?? 'idle';
  const key = keyOf(
    phase,
    guarded(() => laundryFault(values), null),
    values.door_state,
  );
  const underlying = underlyingOf(phase, snapshot);
  const running = key === phase && key !== 'anti_crease' && isLaundryRunning(phase);
  const pieces = piecesOf(snapshot, key, underlying, running || key === 'paused');
  const line = lineOf(pieces, running);
  return {
    key,
    phase,
    underlying,
    offline: !snapshot.online,
    running,
    remaining: numberOf(values.remaining_minutes),
    doneAt: pieces.timing.doneAt,
    startsAt: pieces.timing.startsAt,
    finishedAt: pieces.finishedAt,
    finishedMs: pieces.finishedMs,
    program: pieces.program,
    rpm: pieces.rpm,
    fault: pieces.fault,
    word: pieces.word,
    line,
    short: shortOf(pieces, line),
    left: pieces.left,
    door: doorOf(snapshot, key, phase),
    tone: toneOf(key, running, !snapshot.online),
    readiness: guarded(() => laundryReadiness(values, snapshot.online), null),
    resting: RESTING.has(key),
    startable: snapshot.online && RESTING.has(key),
    startLabel: RESTARTS.has(key) ? 'Start again' : 'Start',
  };
}
