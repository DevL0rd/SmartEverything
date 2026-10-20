import type { SignalInput } from '@smarteverything/domain';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import { setImmediate as macrotask } from 'node:timers/promises';
import { SimulatedClock } from '../../clock/simulated';
import type { Cancel } from '../../clock';
import type { DriverPorts } from '../driver/ports';
import { WaitIndex } from '../waits/wait-index';
import { SimAnswers } from './sim-answers';
import type { WorldReadDeps } from '../world-v3/deps';
import type { BreakpointHit, Proceed } from './breakpoints';
import type { WouldSend } from './effects-sim';
import { SimRig } from './rig';
import type { RunReport, SimStart } from './rig';
import { STEP_LIMIT, parseScenario } from './scenario';
import type { Scenario, ScenarioInput, TimelineEvent } from './scenario';

export type SimulationStatus = 'finished' | 'idle' | 'paused' | 'horizon' | 'steps';

export interface SimulationRequest {
  readonly scenario: ScenarioInput;
  readonly base: WorldReadDeps;
  readonly start: SimStart;
  readonly child?: ((automationId: string) => SimStart | undefined) | undefined;
  readonly breakpoints?: readonly string[] | undefined;
}

export interface SimulationReport {
  readonly status: SimulationStatus;
  readonly now: string;
  readonly commands: readonly WouldSend[];
  readonly runs: readonly RunReport[];
  readonly records: readonly StepRecord[];
  readonly paused: readonly BreakpointHit[];
  readonly steps: number;
}

class SimSignals {
  private readonly listeners = new Set<(signal: SignalInput) => void>();

  subscribe = (listener: (signal: SignalInput) => void): Cancel => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  emit(signal: SignalInput): void {
    for (const listener of [...this.listeners]) listener(signal);
  }
}

export class Simulation {
  private readonly scenario: Scenario;
  private readonly clock: SimulatedClock;
  private readonly signals = new SimSignals();
  private readonly answers = new SimAnswers();
  private readonly yields: (() => void)[] = [];
  private readonly rig: SimRig;
  private readonly runId: string;
  private cursor = 0;

  constructor(request: SimulationRequest) {
    this.scenario = parseScenario(request.scenario);
    this.clock = new SimulatedClock(new Date(this.scenario.startMs).toISOString());
    this.rig = new SimRig({
      kind: 'simulated',
      clock: this.clock,
      base: request.base,
      watching: (world): DriverPorts['watch'] =>
        new WaitIndex({
          feed: world.feed,
          signals: this.signals,
          clock: this.clock,
          answers: this.answers,
        }).watch,
      overrides: this.scenario,
      breakpoints: request.breakpoints ?? [],
      zone: this.scenario.zone,
      child: request.child,
      yieldNow: (resume): void => {
        this.yields.push(resume);
      },
    });
    this.runId = this.rig.start(request.start);
  }

  get rootRunId(): string {
    return this.runId;
  }

  proceed(runId: string, how: Proceed): boolean {
    return this.rig.breakpoints.proceed(runId, how);
  }

  async run(): Promise<SimulationReport> {
    for (;;) {
      await this.settle();
      if (this.rig.paused.length > 0) return this.report('paused');
      if (this.rig.totalSteps > STEP_LIMIT) return this.report('steps');
      const next = this.nextInstant();
      if (next === undefined)
        return this.report(this.rig.driver.active === 0 ? 'finished' : 'idle');
      if (next > this.scenario.endMs) {
        this.clock.jumpTo(new Date(this.scenario.endMs).toISOString());
        return this.report('horizon');
      }
      this.advanceTo(next);
    }
  }

  private async settle(): Promise<void> {
    for (;;) {
      const ready = this.yields.splice(0);
      for (const resume of ready) resume();
      if (ready.length > 0) continue;
      await macrotask();
      if (this.yields.length === 0) return;
    }
  }

  private nextInstant(): number | undefined {
    const scripted = this.scenario.timeline[this.cursor]?.at;
    const timer = this.clock.nextDue();
    if (scripted === undefined || timer === undefined) return scripted ?? timer;
    return Math.min(scripted, timer);
  }

  private advanceTo(target: number): void {
    this.clock.advanceTo(new Date(target).toISOString());
    for (;;) {
      const event = this.scenario.timeline[this.cursor];
      if (event === undefined || event.at > target) return;
      this.cursor += 1;
      this.deliver(event);
    }
  }

  private deliver(event: TimelineEvent): void {
    if ('signal' in event) this.signals.emit(event.signal);
    else if ('answer' in event) this.answers.answer(event.answer);
    else this.rig.world.setDevice(event.device.device, event.device.control, event.device.value);
  }

  private report(status: SimulationStatus): SimulationReport {
    return {
      status,
      now: this.clock.now().toISOString(),
      commands: this.rig.commands,
      runs: this.rig.runs,
      records: this.rig.records,
      paused: this.rig.paused,
      steps: this.rig.totalSteps,
    };
  }
}
