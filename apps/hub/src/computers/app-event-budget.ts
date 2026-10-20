export interface AppEventBudgetOptions {
  readonly capacity: number;
  readonly perSecond: number;
  readonly now: () => number;
}

export type BudgetDecision =
  | { readonly allowed: true; readonly skipped: number }
  | { readonly allowed: false; readonly skipped: number };

export class AppEventBudget {
  private tokens: number;
  private at: number;
  private skipped = 0;

  constructor(private readonly options: AppEventBudgetOptions) {
    this.tokens = options.capacity;
    this.at = options.now();
  }

  take(): BudgetDecision {
    const now = this.options.now();
    const refill = ((now - this.at) / 1000) * this.options.perSecond;
    this.tokens = Math.min(this.options.capacity, this.tokens + refill);
    this.at = now;
    if (this.tokens < 1) {
      this.skipped += 1;
      return { allowed: false, skipped: this.skipped };
    }
    this.tokens -= 1;
    const skipped = this.skipped;
    this.skipped = 0;
    return { allowed: true, skipped };
  }
}
