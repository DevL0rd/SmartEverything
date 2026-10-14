import type { HarnessDesiredConfiguration, HarnessPluginReadiness } from '@smarteverything/domain';
import type { HarnessConfiguration } from '../composition/configuration';
import { HarnessRuntimeError } from './errors';

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

  constructor(
    private readonly configuration: HarnessConfiguration,
    private readonly notifyPending: HarnessConfigurationPending | undefined,
  ) {}

  async request(input: HarnessDesiredConfiguration, sessions: number): Promise<void> {
    const desired = this.configuration.validate(input);
    if (
      this.pending === undefined &&
      this.ready &&
      desired.revision === this.configuration.revision()
    )
      return;
    this.pending = desired;
    if (sessions > 0) {
      this.notifyPending?.(desired.revision);
      return;
    }
    await this.applyPending();
  }

  async applyPending(): Promise<void> {
    if (this.pending === undefined || this.closing) return;
    this.ready = false;
    await this.configuration.reconcile(this.pending);
    this.pending = undefined;
    this.ready = true;
  }

  suspend(): void {
    this.closing = true;
  }

  state(): HarnessRuntimeConfigurationState {
    return {
      revision: this.configuration.revision(),
      pendingRevision: this.pending?.revision ?? null,
      readiness: this.configuration.snapshot(),
    };
  }

  assertReady(): void {
    if (this.pending !== undefined || !this.ready)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Shared configuration is pending; drain and reconcile before opening a session.',
      );
  }
}
