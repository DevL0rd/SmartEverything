import type {
  BrushAdvert,
  BrushFrame,
  BrushLinkPhase,
  BrushPressure,
  BrushProfile,
  BrushSessionState,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { BrandItem, BrandRuntime, BrushBrand, BrushSnapshot, RuntimePort } from './brand';
import { BatchOutcome } from './outcome';
import { SessionMachine, type MachineEvent, type Tick } from './session-machine';

const PRESSURE_HOLD_MS = 2000;

function sessionStateOf(event: MachineEvent, previous: BrushSessionState): BrushSessionState {
  switch (event.kind) {
    case 'started':
    case 'resumed':
      return 'running';
    case 'paused':
      return 'paused';
    case 'finished':
      return event.stoppedEarly ? 'stopped_early' : 'completed';
    default:
      return previous;
  }
}

export class BrushRuntime {
  readonly brand: BrandRuntime;
  readonly machine: SessionMachine;
  session: BrushSessionState = 'idle';
  pressureShown: BrushPressure | null = null;
  private candidate: { readonly pressure: BrushPressure; readonly sinceMs: number } | null = null;
  private heardAtMs: number | null = null;

  constructor(
    readonly definition: BrushBrand,
    entry: LocalDeviceEntry,
    port: RuntimePort,
  ) {
    this.brand = definition.runtime(entry, port);
    this.machine = new SessionMachine(definition.rules, this.brand.profile.zoneSource === 'pacer');
  }

  get profile(): BrushProfile {
    return this.brand.profile;
  }

  get state(): BrushSnapshot {
    return this.brand.snapshot;
  }

  get transferring(): boolean {
    return this.brand.transferring;
  }

  linkStarted(): void {
    this.brand.reset();
  }

  ingest(frames: readonly BrushFrame[], adverts: readonly BrushAdvert[]): BatchOutcome {
    const outcome = new BatchOutcome();
    for (const item of this.brand.decode(frames, adverts)) {
      this.apply(item, outcome);
    }
    return outcome;
  }

  linkChanged(phase: BrushLinkPhase, at: string): BatchOutcome {
    const outcome = new BatchOutcome();
    if (phase === 'linked') {
      this.brand.wake();
      outcome.touched.add('activity');
      return outcome;
    }
    if (this.brand.sleep(true)) {
      outcome.touched.add('activity');
    }
    this.step(at, false, outcome);
    this.resetPressure();
    return outcome;
  }

  get silenceDueMs(): number | null {
    const { silenceS } = this.definition.rules;
    if (silenceS === 0 || this.heardAtMs === null || !this.machine.isOpen) {
      return null;
    }
    return this.heardAtMs + silenceS * 1000;
  }

  expire(at: string): BatchOutcome {
    const outcome = new BatchOutcome();
    this.dispatch(this.machine.expire(at), outcome);
    const silentAt = this.silenceDueMs;
    if (silentAt !== null && Date.parse(at) >= silentAt) {
      this.fallSilent(at, outcome);
    }
    return outcome;
  }

  private fallSilent(at: string, outcome: BatchOutcome): void {
    if (this.brand.sleep(false)) {
      outcome.touched.add('activity');
    }
    this.step(at, false, outcome);
    this.resetPressure();
  }

  private apply(item: BrandItem, outcome: BatchOutcome): void {
    switch (item.kind) {
      case 'unreadable':
        outcome.unreadable.push(item);
        return;
      case 'refused':
        outcome.refused.push({ status: item.status, at: item.at });
        return;
      case 'record':
        outcome.records.push(item);
        return;
      case 'ended':
        outcome.ended.push(item.sessionId);
        return;
      case 'state':
        this.applyState(item, outcome);
        return;
    }
  }

  private applyState(
    item: Extract<BrandItem, { readonly kind: 'state' }>,
    outcome: BatchOutcome,
  ): void {
    const { touched, at } = item;
    this.heardAtMs = Date.parse(at);
    touched.forEach((name) => outcome.touched.add(name));
    if (touched.has('pressure') || touched.has('elapsed')) {
      this.holdPressure(at);
    }
    if (touched.has('activity') || touched.has('elapsed') || touched.has('pressure')) {
      this.step(at, touched.has('elapsed'), outcome);
    }
  }

  private step(at: string, elapsedChanged: boolean, outcome: BatchOutcome): void {
    const snapshot = this.brand.snapshot;
    const tick: Tick = {
      at,
      snapshot,
      pressure: this.pressureShown ?? snapshot.pressure,
      elapsedChanged,
    };
    this.dispatch(this.machine.step(tick), outcome);
  }

  private dispatch(events: readonly MachineEvent[], outcome: BatchOutcome): void {
    for (const event of events) {
      this.session = sessionStateOf(event, this.session);
      outcome.events.push(event);
      if (event.kind === 'finished') {
        this.resetPressure();
      }
    }
  }

  private holdPressure(at: string): void {
    const seen = this.brand.snapshot.pressure;
    if (seen === null || seen === this.pressureShown) {
      this.candidate = null;
      return;
    }
    const sinceMs = Date.parse(at);
    if (this.candidate?.pressure !== seen) {
      this.candidate = { pressure: seen, sinceMs };
    }
    if (sinceMs - this.candidate.sinceMs >= PRESSURE_HOLD_MS || this.pressureShown === null) {
      this.pressureShown = seen;
      this.candidate = null;
    }
  }

  private resetPressure(): void {
    this.brand.clearPressure();
    if (this.pressureShown !== null && this.pressureShown !== 'no_contact') {
      this.pressureShown = 'no_contact';
    }
    this.candidate = null;
  }
}
