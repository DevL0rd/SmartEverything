import { ApiError, type HarnessDesiredConfiguration } from '@smarteverything/domain';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import { Logger } from '@smarteverything/logging';
import type { HarnessService } from '../harness/service';

export class HubHarnessConfiguration {
  private dispatcher: HarnessDispatcher | null = null;
  private readonly log = new Logger('hub.harness-configuration');
  constructor(
    private readonly service: HarnessService,
    private readonly identity: { readonly runtimeInstance: string; readonly generation: string },
    private readonly now: () => Date,
  ) {}

  bind(dispatcher: HarnessDispatcher): void {
    this.dispatcher = dispatcher;
  }

  changed(): void {
    if (this.dispatcher !== null) this.report(false);
  }

  pending(): void {
    this.report(true);
  }

  configure(configuration: HarnessDesiredConfiguration): void {
    const dispatcher = this.dispatcher;
    if (dispatcher === null) throw new ApiError('conflict', 'Hub composition is not initialized.');
    void dispatcher.runtime
      .configure(configuration)
      .then(() => {
        this.report(dispatcher.runtime.configurationState().pendingRevision !== null);
      })
      .catch((cause: unknown) => {
        this.log.error('configuration.apply_failed', cause);
      });
  }

  report(pending: boolean): void {
    const dispatcher = this.dispatcher;
    if (dispatcher === null) return;
    const state = dispatcher.runtime.configurationState();
    if (state.revision === null)
      throw new ApiError('conflict', 'Hub has no applied configuration.');
    this.service.configuration.report(
      {
        target: { kind: 'server' },
        runtime_instance: this.identity.runtimeInstance,
        connection_generation: this.identity.generation,
        revision: state.revision,
        readiness: [...state.readiness],
        reported_at: this.now().toISOString(),
        ...(pending && state.pendingRevision !== null
          ? { pending_revision: state.pendingRevision }
          : {}),
      },
      dispatcher.runtime.manifest(),
      this.service.directory.get({ kind: 'server' }),
    );
  }
}
