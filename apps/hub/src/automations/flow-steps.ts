import type { Clock } from '../clock';
import type { StepV2 } from '@smarteverything/domain';
import { admitRun, runDelay, type RunContext } from './run-context';
import type { AutomationWorld } from './world';

type IfStepV2 = Extract<StepV2, { do: 'if' }>;
type RepeatStepV2 = Extract<StepV2, { do: 'repeat' }>;

const DEFAULT_LIMIT_MS = 3_600_000;
const POLL_GAP_MS = 1000;
const LIMIT_NOTE = 'The repeat reached its time limit and stopped.';

export class FlowSteps {
  constructor(
    private readonly world: AutomationWorld,
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly run: (steps: readonly StepV2[], context: RunContext) => Promise<void>,
  ) {}

  async branch(step: IfStepV2, context: RunContext): Promise<null> {
    const chosen = step.branches.find((branch) => this.world.holds(branch.when, context.inputs));
    const steps = chosen === undefined ? step.else : chosen.then;
    if (steps !== undefined) await this.run(steps, context);
    return null;
  }

  async repeat(step: RepeatStepV2, context: RunContext): Promise<string | null> {
    const limit = new AbortController();
    const deadline = this.clock.now().getTime() + (step.limitMs ?? DEFAULT_LIMIT_MS);
    const cancelTimer = this.clock.at(new Date(deadline), () => {
      limit.abort();
    });
    const inner: RunContext = {
      ...context,
      signal: AbortSignal.any([context.signal, limit.signal]),
    };
    try {
      await this.loop(step, inner, deadline);
      return null;
    } catch (cause) {
      if (limit.signal.aborted && !context.signal.aborted) return LIMIT_NOTE;
      throw cause;
    } finally {
      cancelTimer();
    }
  }

  private async loop(step: RepeatStepV2, context: RunContext, deadline: number): Promise<void> {
    const gap = step.gapMs ?? (step.times === undefined ? POLL_GAP_MS : 0);
    for (let turn = 0; this.enters(step, turn, context); turn += 1) {
      admitRun(context);
      await this.run(step.steps, context);
      admitRun(context);
      if (this.finished(step, turn, context)) return;
      const remaining = Math.max(0, deadline - this.clock.now().getTime());
      if (gap > 0) await runDelay(this.clock, Math.min(gap, remaining), context);
    }
  }

  private enters(step: RepeatStepV2, turn: number, context: RunContext): boolean {
    admitRun(context);
    if (step.times !== undefined) return turn < step.times;
    return step.while === undefined || this.world.holds(step.while, context.inputs);
  }

  private finished(step: RepeatStepV2, turn: number, context: RunContext): boolean {
    if (step.times !== undefined) return turn + 1 >= step.times;
    return step.until !== undefined && this.world.holds(step.until, context.inputs);
  }
}
