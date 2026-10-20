import { JSON_VALUE, appendTo } from '@smarteverything/domain';
import type {
  EffectRequest,
  NodeResult,
  StepContext,
  StepRecord,
} from '@smarteverything/flow/interpret/frames';
import { CAUSE_LINK } from '@smarteverything/flow/state/run-state';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Clock } from '../../clock';
import { RunDriver } from '../driver/admission';
import type { DriverPorts, RunKind, RunScope, RunStart } from '../driver/ports';
import type { WorldReadDeps } from '../world-v3/deps';
import type { WorldReads } from '../world-v3/read-port';
import { Breakpoints } from './breakpoints';
import type { BreakpointHit } from './breakpoints';
import { EffectsSim } from './effects-sim';
import type { WouldSend } from './effects-sim';
import type { Overrides } from './scenario';
import { ScenarioWorld } from './world-sim';

type SimKind = Extract<RunKind, 'dry' | 'simulated'>;

export interface SimEnv {
  readonly clock: Clock;
  readonly reads: WorldReads;
  readonly world: ScenarioWorld;
  readonly zone: string | undefined;
}

const CHILD_CALL = z.object({
  automation: z.string().min(1),
  inputs: z.record(z.string(), JSON_VALUE),
  wait: z.boolean(),
  parentRunId: z.string().min(1),
  causeChain: z.array(CAUSE_LINK),
});

export type ChildCall = z.infer<typeof CHILD_CALL>;

export interface SimStart {
  readonly build: (runId: string, env: SimEnv, call: ChildCall | null) => RunStart;
}

export interface RunReport {
  readonly runId: string;
  readonly automationId: string;
  readonly status: 'succeeded' | 'failed' | 'cancelled';
  readonly error: string | null;
  readonly steps: number;
}

export interface RigOptions {
  readonly kind: SimKind;
  readonly clock: Clock;
  readonly base: WorldReadDeps;
  readonly watching: (world: ScenarioWorld) => DriverPorts['watch'];
  readonly overrides: Overrides;
  readonly breakpoints: Iterable<string>;
  readonly zone: string | undefined;
  readonly child?: ((automationId: string) => SimStart | undefined) | undefined;
  readonly yieldNow?: ((resume: () => void) => void) | undefined;
}

function uuidOf(counter: number): string {
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export class SimRig {
  readonly world: ScenarioWorld;
  readonly effects: EffectsSim;
  readonly breakpoints: Breakpoints;
  readonly driver: RunDriver;
  readonly runs: RunReport[] = [];
  readonly records: StepRecord[] = [];
  private readonly steps = new Map<string, number>();
  private readonly waiting = new Map<string, ((report: RunReport) => void)[]>();
  private readonly watcher: DriverPorts['watch'];
  private counter = 0;

  constructor(private readonly options: RigOptions) {
    this.world = new ScenarioWorld(options.base, options.clock);
    for (const entry of options.overrides.devices) {
      this.world.setDevice(entry.device, entry.control, entry.value);
    }
    for (const entry of options.overrides.variables) {
      this.world.setVariable(entry.automationId, entry.name, entry.value);
    }
    this.watcher = options.watching(this.world);
    this.breakpoints = new Breakpoints(options.breakpoints);
    this.effects = new EffectsSim({
      clock: options.clock,
      world: this.world,
      scripts: options.overrides.effects,
      applyToWorld: options.kind === 'simulated',
      children: this.callChild,
    });
    this.driver = new RunDriver({
      ports: this.ports(),
      decisions: { record: (): void => undefined },
      log: new Logger('hub.simulation'),
      ...(options.yieldNow === undefined ? {} : { yieldNow: options.yieldNow }),
    });
  }

  get commands(): readonly WouldSend[] {
    return this.effects.sent;
  }

  get paused(): readonly BreakpointHit[] {
    return this.breakpoints.paused;
  }

  get totalSteps(): number {
    return [...this.steps.values()].reduce((total, steps) => total + steps, 0);
  }

  start(spec: SimStart, call: ChildCall | null = null): string {
    const runId = this.nextId();
    const env: SimEnv = {
      clock: this.options.clock,
      reads: this.world.reads(),
      world: this.world,
      zone: this.options.zone,
    };
    const built = spec.build(runId, env, call);
    const context: StepContext = {
      ...built.context,
      ops: this.breakpoints.instrument(built.context.ops),
    };
    return this.driver.run({ ...built, context, kind: this.options.kind });
  }

  completion(runId: string): Promise<RunReport> {
    const done = this.runs.find((report) => report.runId === runId);
    if (done !== undefined) return Promise.resolve(done);
    return new Promise((resolve) => {
      appendTo(this.waiting, runId, resolve);
    });
  }

  private nextId(): string {
    this.counter += 1;
    return uuidOf(this.counter);
  }

  private readonly callChild = async (
    request: EffectRequest,
    _scope: RunScope,
  ): Promise<NodeResult> => {
    const call = CHILD_CALL.safeParse(request.params);
    const spec = call.success ? this.options.child?.(call.data.automation) : undefined;
    if (!call.success || spec === undefined) {
      return { ok: false, class: 'NotFound', message: 'The automation to run is not in scope' };
    }
    const runId = this.start(spec, call.data);
    if (!call.data.wait) {
      await this.driver.firstHold(runId);
      return { ok: true, value: {} };
    }
    const report = await this.completion(runId);
    if (report.status === 'succeeded') return { ok: true, value: {} };
    return { ok: false, class: 'Failed', message: report.error ?? 'The run did not succeed' };
  };

  private ports(): DriverPorts {
    const { clock } = this.options;
    return {
      clock,
      monotonic: () => 0,
      ids: () => this.nextId(),
      storm: () => undefined,
      perform: this.effects.perform,
      watch: (wait, resume, scope) =>
        wait.kind === 'breakpoint'
          ? this.breakpoints.hold(wait, resume, scope)
          : this.watcher(wait, resume, scope),
      afterCancel: () => undefined,
      refused: () => undefined,
      recordRun: () => undefined,
      sink: {
        queued: (): void => undefined,
        dropped: (): void => undefined,
        started: (): void => undefined,
        slice: (_runId, records): void => {
          this.records.push(...records);
        },
        parked: (state): void => {
          this.steps.set(state.runId, state.budgets.steps);
        },
        resumed: (): void => undefined,
        finished: (state, ending): void => {
          this.steps.set(state.runId, state.budgets.steps);
          this.breakpoints.forget(state.runId);
          this.report({
            runId: state.runId,
            automationId: state.automationId,
            status: ending.status,
            error: ending.error?.message ?? null,
            steps: state.budgets.steps,
          });
        },
      },
    };
  }

  private report(report: RunReport): void {
    this.runs.push(report);
    for (const resolve of this.waiting.get(report.runId) ?? []) resolve(report);
    this.waiting.delete(report.runId);
  }
}
