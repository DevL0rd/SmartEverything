import {
  worthKeeping,
  type BrushIntensity,
  type BrushMode,
  type BrushPressure,
  type BrushSessionRules,
  type SessionPressure,
} from '@smarteverything/domain';
import type { BrushSnapshot, BrushingDetails, EndHint } from './brand';
import { OpenSession } from './session-open';

const DEFAULT_ROUTINE_SECONDS = 120;

const IMMEDIATE_END = new Set(['asleep', 'charging', 'off']);

export interface Tick {
  readonly at: string;
  readonly snapshot: BrushSnapshot;
  readonly pressure: BrushPressure | null;
  readonly elapsedChanged: boolean;
}

export interface ObservedSession {
  readonly startedAt: string;
  readonly durationS: number;
  readonly routineS: number;
  readonly mode: BrushMode | null;
  readonly intensity: BrushIntensity | null;
  readonly handleSessionId: number | null;
  readonly complete: boolean;
  readonly pressure: SessionPressure | null;
  readonly headSerial: string | null;
  readonly zones: readonly number[] | null;
  readonly details: BrushingDetails | null;
}

export type MachineEvent =
  | { readonly kind: 'started'; readonly at: string; readonly caught: boolean }
  | { readonly kind: 'paused'; readonly at: string }
  | { readonly kind: 'resumed'; readonly at: string }
  | {
      readonly kind: 'finished';
      readonly at: string;
      readonly session: ObservedSession;
      readonly stoppedEarly: boolean;
    };

interface Capture {
  readonly at: string;
  readonly atMs: number;
  readonly mode: BrushMode | null;
  readonly intensity: BrushIntensity | null;
  readonly routineS: number | null;
  readonly sessionId: number | null;
  readonly headSerial: string | null;
  readonly endHint: EndHint | null;
  readonly zoneSeconds: readonly number[];
  readonly face: number | null;
  readonly battery: number | null;
}

function isBrushing(snapshot: BrushSnapshot): boolean {
  return snapshot.activity === 'brushing' || snapshot.activity === 'paused';
}

function endsNow(snapshot: BrushSnapshot): boolean {
  return snapshot.endHint !== null || IMMEDIATE_END.has(snapshot.activity);
}

function captureOf(tick: Tick): Capture {
  const { snapshot } = tick;
  return {
    at: tick.at,
    atMs: Date.parse(tick.at),
    mode: snapshot.mode,
    intensity: snapshot.intensity,
    routineS: snapshot.routineS,
    sessionId: snapshot.sessionId,
    headSerial: typeof snapshot.head.serial === 'string' ? snapshot.head.serial : null,
    endHint: snapshot.endHint,
    zoneSeconds: [...snapshot.zoneSeconds],
    face: snapshot.face,
    battery: snapshot.battery,
  };
}

export class SessionMachine {
  private open: OpenSession | null = null;
  private closing: Capture | null = null;

  constructor(
    private readonly rules: BrushSessionRules,
    private readonly pacer: boolean,
  ) {}

  get isOpen(): boolean {
    return this.open !== null;
  }

  get brushedSeconds(): number {
    return this.open?.maxElapsedS ?? 0;
  }

  get deadlineMs(): number | null {
    return this.closing === null ? null : this.closing.atMs + this.rules.pauseGraceS * 1000;
  }

  get pressureTrace(): { readonly strip: readonly (0 | 1 | 2)[]; readonly excessS: number } {
    const strip = this.open?.strip ?? [];
    return { strip, excessS: strip.filter((code) => code === 2).length };
  }

  step(tick: Tick): MachineEvent[] {
    const open = this.open;
    if (open === null) {
      return isBrushing(tick.snapshot) ? this.begin(tick) : [];
    }
    if (this.closing !== null) {
      return this.afterStop(open, this.closing, tick);
    }
    if (!isBrushing(tick.snapshot)) {
      return this.stop(open, tick);
    }
    return this.follow(open, tick);
  }

  expire(at: string): MachineEvent[] {
    const { open, closing } = this;
    const due = this.deadlineMs;
    if (open === null || closing === null || due === null || Date.parse(at) < due) {
      return [];
    }
    return this.finish(open, closing);
  }

  private begin(tick: Tick): MachineEvent[] {
    const open = new OpenSession(tick, this.rules.catchLimitS);
    this.open = open;
    open.track(tick);
    return [{ kind: 'started', at: tick.at, caught: open.caught }];
  }

  private follow(open: OpenSession, tick: Tick): MachineEvent[] {
    open.track(tick);
    const paused = tick.snapshot.activity === 'paused';
    return open.setPaused(paused) ? [{ kind: paused ? 'paused' : 'resumed', at: tick.at }] : [];
  }

  private stop(open: OpenSession, tick: Tick): MachineEvent[] {
    const capture = captureOf(tick);
    if (this.rules.pauseGraceS === 0 || endsNow(tick.snapshot)) {
      return this.finish(open, capture);
    }
    this.closing = capture;
    return open.setPaused(true) ? [{ kind: 'paused', at: tick.at }] : [];
  }

  private afterStop(open: OpenSession, closing: Capture, tick: Tick): MachineEvent[] {
    const { snapshot } = tick;
    const due = this.deadlineMs ?? closing.atMs;
    const ended = endsNow(snapshot);
    if (!ended && Date.parse(tick.at) < due) {
      return this.resume(open, tick);
    }
    const hint = snapshot.endHint ?? closing.endHint;
    const events = this.finish(open, { ...closing, endHint: hint });
    return !ended && isBrushing(snapshot) ? [...events, ...this.begin(tick)] : events;
  }

  private resume(open: OpenSession, tick: Tick): MachineEvent[] {
    if (!isBrushing(tick.snapshot)) {
      return [];
    }
    this.closing = null;
    return this.follow(open, tick);
  }

  private finish(open: OpenSession, capture: Capture): MachineEvent[] {
    this.open = null;
    this.closing = null;
    if (!worthKeeping(open.maxElapsedS)) {
      return [];
    }
    const routineS = capture.routineS ?? DEFAULT_ROUTINE_SECONDS;
    const stoppedEarly =
      capture.endHint === 'aborted' ||
      (capture.endHint !== 'complete' && open.maxElapsedS < routineS);
    return [
      {
        kind: 'finished',
        at: capture.at,
        stoppedEarly,
        session: this.sessionOf(open, capture, routineS, !stoppedEarly),
      },
    ];
  }

  private sessionOf(
    open: OpenSession,
    capture: Capture,
    routineS: number,
    complete: boolean,
  ): ObservedSession {
    const zoneSeconds = capture.zoneSeconds.length > 0 ? capture.zoneSeconds : open.zoneSeconds;
    const sectors = zoneSeconds.length;
    return {
      startedAt: open.startedAt,
      durationS: open.maxElapsedS,
      routineS,
      mode: capture.mode,
      intensity: capture.intensity,
      handleSessionId: capture.sessionId,
      complete,
      pressure: open.pressure(this.pacer),
      headSerial: capture.headSerial,
      zones: this.pacer && sectors > 0 ? zoneSeconds : null,
      details: this.pacer
        ? {
            zoneSource: 'pacer',
            face: capture.face ?? open.face,
            batteryEnd: capture.battery,
            handleUser: null,
            sectors: sectors === 0 ? null : sectors,
          }
        : null,
    };
  }
}
