import type { AiBudgetCredits } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { OpenRouterError } from '../openrouter/errors';
import { messageOf } from '@smarteverything/logging';

const CREDITS_REFRESH_MS = 10 * 60_000;

export interface CreditsSource {
  readonly hasKey: () => boolean;
  readonly credits: () => Promise<{ readonly total: number; readonly used: number }>;
}

export interface CreditsReading {
  readonly credits: AiBudgetCredits;
  readonly checkedAt: string | null;
}

export class CreditsWatch {
  private reading: CreditsReading = { credits: { state: 'no_key' }, checkedAt: null };
  private pending: Promise<CreditsReading> | null = null;

  constructor(
    private readonly source: CreditsSource,
    private readonly now: () => Date,
    private readonly log: Logger,
  ) {}

  current(): CreditsReading {
    return this.reading;
  }

  async fresh(): Promise<CreditsReading> {
    const checked = this.reading.checkedAt;
    const stale =
      checked === null || this.now().getTime() - Date.parse(checked) >= CREDITS_REFRESH_MS;
    return stale ? this.refresh() : this.reading;
  }

  refresh(): Promise<CreditsReading> {
    this.pending ??= this.read().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async read(): Promise<CreditsReading> {
    this.reading = { credits: await this.ask(), checkedAt: this.now().toISOString() };
    return this.reading;
  }

  private async ask(): Promise<AiBudgetCredits> {
    if (!this.source.hasKey()) {
      return { state: 'no_key' };
    }
    try {
      return { state: 'known', ...(await this.source.credits()) };
    } catch (cause) {
      if (cause instanceof OpenRouterError && cause.code === 'refused') {
        return { state: 'needs_management_key' };
      }
      const reason = messageOf(cause);
      this.log.warn('budget.credits_unavailable', { reason });
      return { state: 'unavailable', reason: reason.slice(0, 400) };
    }
  }
}
