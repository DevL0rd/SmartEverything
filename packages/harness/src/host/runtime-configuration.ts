import type { HarnessDesiredConfiguration, HarnessPluginReadiness } from '@smarteverything/domain';
import { describeFailure } from '@smarteverything/logging';
import type { HarnessConfiguration } from '../composition/configuration';

export interface HarnessRuntimeConfigurationState {
  readonly revision: string | null;
  readonly pendingRevision: string | null;
  readonly readiness: readonly HarnessPluginReadiness[];
}

export type HarnessConfigurationPending = (requestedRevision: string) => void;

export class HarnessRuntimeConfiguration {
  private pending: HarnessDesiredConfiguration | undefined;
  private ready = true;
  private closing = false;
  private failure: string | undefined;

  constructor(
    private readonly configuration: HarnessConfiguration,
    private readonly notifyPending: HarnessConfigurationPending | undefined,
  ) {}

  request(input: HarnessDesiredConfiguration): void {
    const desired = this.configuration.validate(input);
    if (
      this.pending === undefined &&
      this.ready &&
      desired.revision === this.configuration.revision()
    )
      return;
    this.pending = desired;
    this.failure = undefined;
  }

  hasPending(): boolean {
    return this.pending !== undefined && !this.closing;
  }

  waiting(): void {
    if (this.pending !== undefined) this.notifyPending?.(this.pending.revision);
  }

  async applyPending(): Promise<void> {
    if (this.pending === undefined || this.closing) return;
    const { revision } = this.pending;
    this.ready = false;
    try {
      await this.configuration.reconcile(this.pending);
    } catch (error) {
      this.failure = describeFailure(error).message;
      this.notifyPending?.(revision);
      throw error;
    }
    this.pending = undefined;
    this.failure = undefined;
    this.ready = true;
  }

  suspend(): void {
    this.closing = true;
  }

  state(): HarnessRuntimeConfigurationState {
    return {
      revision: this.configuration.revision(),
      pendingRevision: this.pending?.revision ?? null,
      readiness: this.readiness(),
    };
  }

  private readiness(): readonly HarnessPluginReadiness[] {
    const { failure } = this;
    const snapshot = this.configuration.snapshot();
    if (failure === undefined) return snapshot;
    return snapshot.map((entry) => ({ ...entry, state: 'failed', reason: failure }));
  }
}
