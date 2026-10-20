import {
  providerInOutage,
  providerStateOf,
  type Provider,
  type RowChange,
} from '@smarteverything/domain';
import type { EventRouter } from '../state/event-router';

export interface ProviderOutagesOptions {
  readonly events: Pick<EventRouter, 'record'>;
  readonly now: () => Date;
}

export class ProviderOutages {
  private readonly open = new Set<Provider>();

  constructor(private readonly options: ProviderOutagesOptions) {}

  covers(provider: Provider): boolean {
    return this.open.has(provider);
  }

  observe(change: RowChange): void {
    if (change.table !== 'provider_links' || change.record === null) {
      return;
    }
    const { record } = change;
    const state = providerStateOf(record);
    if (!providerInOutage(state)) {
      if (record.status !== 'linking') {
        this.open.delete(record.provider);
      }
      return;
    }
    if (this.open.has(record.provider)) {
      return;
    }
    this.open.add(record.provider);
    this.options.events.record({
      deviceId: null,
      kind: 'provider_error',
      occurredAt: this.options.now().toISOString(),
      details: {
        provider: record.provider,
        state,
        problem: record.problem,
        error: record.last_error,
      },
    });
  }
}
