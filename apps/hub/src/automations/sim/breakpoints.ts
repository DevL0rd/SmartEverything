import type { PlanOp } from '@smarteverything/flow/compile/plan';
import { stay, unsupported } from '@smarteverything/flow/interpret/frames';
import type {
  Env,
  NodeResult,
  OpHandler,
  OpHandlers,
  StepResult,
} from '@smarteverything/flow/interpret/frames';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type { Wait } from '@smarteverything/flow/state/run-state';
import { z } from 'zod';
import type { Cancel } from '../../clock';
import type { RunScope } from '../driver/ports';

export interface BreakpointHit {
  readonly runId: string;
  readonly nodeId: string;
  readonly path: string;
  readonly at: number;
}

export type Proceed = 'continue' | 'step';

interface Held {
  readonly hit: BreakpointHit;
  readonly resume: (resume: WaitResume) => void;
}

const CONTINUE: WaitResume = { kind: 'evaluate' };

const BREAKPOINT_RESUME = z.object({ wait: z.object({ kind: z.literal('breakpoint') }) });

function nodeIdOf(op: PlanOp): string | undefined {
  return 'at' in op ? op.at.id : undefined;
}

export class Breakpoints {
  private readonly ids: ReadonlySet<string>;
  private readonly stepping = new Set<string>();
  private readonly resuming = new Set<string>();
  private readonly arriving = new Map<string, BreakpointHit>();
  private readonly held = new Map<string, Held>();
  readonly hits: BreakpointHit[] = [];

  constructor(ids: Iterable<string>) {
    this.ids = new Set(ids);
  }

  get paused(): readonly BreakpointHit[] {
    return [...this.held.values()].map((entry) => entry.hit);
  }

  instrument(ops: OpHandlers): OpHandlers {
    return {
      seq: this.around(ops.seq),
      branch: this.around(ops.branch),
      switch: this.around(ops.switch),
      guard: this.around(ops.guard),
      loop: this.around(ops.loop),
      break: this.around(ops.break),
      continue: this.around(ops.continue),
      parallel: this.around(ops.parallel),
      try: this.around(ops.try),
      call: this.around(ops.call),
      run: this.around(ops.run),
      wait: this.around(ops.wait),
      effect: this.around(ops.effect),
      with_effect: this.around(ops.with_effect),
      compute: this.around(ops.compute),
      read: this.around(ops.read),
      set_var: this.around(ops.set_var),
      state_op: this.around(ops.state_op),
      return: this.around(ops.return),
      stop: this.around(ops.stop),
      fail: this.around(ops.fail),
      breakpoint: this.around(ops.breakpoint),
    };
  }

  hold = (wait: Wait, resume: (resume: WaitResume) => void, scope: RunScope): Cancel => {
    const hit = this.arriving.get(scope.runId);
    this.arriving.delete(scope.runId);
    if (hit === undefined || wait.kind !== 'breakpoint') return () => undefined;
    const entry: Held = { hit, resume };
    this.held.set(scope.runId, entry);
    this.hits.push(hit);
    return () => {
      if (this.held.get(scope.runId) === entry) this.held.delete(scope.runId);
    };
  };

  proceed(runId: string, how: Proceed): boolean {
    const entry = this.held.get(runId);
    if (entry === undefined) return false;
    this.held.delete(runId);
    if (how === 'step') this.stepping.add(runId);
    this.resuming.add(runId);
    entry.resume(CONTINUE);
    return true;
  }

  forget(runId: string): void {
    this.stepping.delete(runId);
    this.resuming.delete(runId);
    this.arriving.delete(runId);
    this.held.delete(runId);
  }

  private around<O extends PlanOp>(handler: OpHandler<O> | undefined): OpHandler<O> {
    const enter = (env: Env, op: O): StepResult =>
      handler === undefined ? unsupported(env, `the operation ${op.op}`) : handler.enter(env, op);
    return {
      enter: (env, op) => (this.pausesAt(env, op) ? this.pause(env, op) : enter(env, op)),
      settle: (env, op, result): StepResult => {
        if (BREAKPOINT_RESUME.safeParse(okValue(result)).success) {
          this.resuming.delete(env.state.runId);
          return enter(env, op);
        }
        return handler?.settle === undefined
          ? unsupported(env, `settling the operation ${op.op}`)
          : handler.settle(env, op, result);
      },
    };
  }

  private pausesAt(env: Env, op: PlanOp): boolean {
    const nodeId = nodeIdOf(op);
    if (nodeId === undefined) return false;
    const { runId } = env.state;
    if (this.resuming.delete(runId)) return false;
    return this.ids.has(nodeId) || this.stepping.delete(runId);
  }

  private pause(env: Env, op: PlanOp): StepResult {
    const nodeId = nodeIdOf(op) ?? env.at.id;
    const wait: Wait = { kind: 'breakpoint', nodePath: env.path, durable: false };
    this.arriving.set(env.state.runId, {
      runId: env.state.runId,
      nodeId,
      path: env.path,
      at: env.now,
    });
    return stay(env, { ...env.state, wait }, { kind: 'park', wait });
  }
}

function okValue(result: NodeResult): unknown {
  return result.ok ? result.value : undefined;
}
