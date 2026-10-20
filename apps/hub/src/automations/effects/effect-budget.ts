import {
  admit,
  fullBucket,
  refilled,
  type Bucket,
  type BudgetLimits,
  type Pending,
} from '@smarteverything/flow/state/budgets';
import type { Clock } from '../../clock';
import { AutomationRunCancelledError } from './run-abort';
import type { EffectRun } from './effect-run';

const EFFECT_BUDGET_SWEEP_MS = 60_000;

type EffectKind = 'effects' | 'effects_person';

export type EffectLimits = Pick<
  BudgetLimits,
  'effects' | 'effectsRun' | 'effectsAutomation' | 'effectsPerson'
>;

export interface EffectAdmission {
  readonly automationId: string;
  readonly kind: EffectKind;
  readonly limits: EffectLimits;
  readonly runBucket: Bucket;
}

interface AutomationBuckets {
  readonly effects: Bucket;
  readonly person: Bucket;
}

export class EffectBudgetExceededError extends Error {
  override readonly name = 'EffectBudgetExceededError';
  readonly budget = 'effects';

  constructor(readonly limit: number) {
    super(
      `The effect budget is used up: more than ${String(limit)} effects at once, and the next free slot is over a minute away.`,
    );
  }
}

export class EffectBudget {
  private readonly automations = new Map<string, AutomationBuckets>();
  private swept = Number.NEGATIVE_INFINITY;

  constructor(private readonly clock: Pick<Clock, 'now' | 'at'>) {}

  async admit(request: EffectAdmission, run: Pick<EffectRun, 'runId' | 'signal'>): Promise<Bucket> {
    if (!request.limits.effects) return request.runBucket;
    const askedAt = this.clock.now().getTime();
    let runBucket = request.runBucket;
    for (;;) {
      const now = this.clock.now().getTime();
      this.sweep(request.limits, now);
      const held = this.automations.get(request.automationId) ?? this.fresh(request.limits, now);
      const entries = this.entries(request, runBucket, held);
      const decision = admit(entries, now, askedAt);
      if (decision.kind === 'exhausted') throw this.exceeded(entries, decision.buckets);
      const [nextRun, nextAutomation, nextPerson] = decision.buckets;
      if (decision.kind === 'go') {
        this.automations.set(request.automationId, {
          effects: nextAutomation ?? held.effects,
          person: nextPerson ?? held.person,
        });
        return nextRun ?? runBucket;
      }
      runBucket = nextRun ?? runBucket;
      await this.park(decision.until, run);
    }
  }

  private fresh(limits: EffectLimits, now: number): AutomationBuckets {
    return {
      effects: fullBucket(limits.effectsAutomation, now),
      person: fullBucket(limits.effectsPerson, now),
    };
  }

  private entries(
    request: EffectAdmission,
    runBucket: Bucket,
    held: AutomationBuckets,
  ): readonly Pending[] {
    const { limits, kind } = request;
    const base: Pending[] = [
      { bucket: runBucket, rate: limits.effectsRun },
      { bucket: held.effects, rate: limits.effectsAutomation },
    ];
    return kind === 'effects_person'
      ? [...base, { bucket: held.person, rate: limits.effectsPerson }]
      : base;
  }

  private exceeded(
    entries: readonly Pending[],
    buckets: readonly Bucket[],
  ): EffectBudgetExceededError {
    const empty = entries.find((_entry, index) => (buckets[index]?.tokens ?? 1) < 1);
    return new EffectBudgetExceededError(empty?.rate.burst ?? 0);
  }

  private park(until: number, run: Pick<EffectRun, 'runId' | 'signal'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        cancel();
        reject(new AutomationRunCancelledError(run.runId));
      };
      const cancel = this.clock.at(new Date(until), () => {
        run.signal.removeEventListener('abort', abort);
        resolve();
      });
      run.signal.addEventListener('abort', abort, { once: true });
      if (run.signal.aborted) abort();
    });
  }

  private sweep(limits: EffectLimits, now: number): void {
    if (now - this.swept < EFFECT_BUDGET_SWEEP_MS) return;
    this.swept = now;
    for (const [id, held] of this.automations) {
      const effects = refilled(held.effects, limits.effectsAutomation, now);
      const person = refilled(held.person, limits.effectsPerson, now);
      if (
        effects.tokens >= limits.effectsAutomation.burst &&
        person.tokens >= limits.effectsPerson.burst
      )
        this.automations.delete(id);
    }
  }
}
