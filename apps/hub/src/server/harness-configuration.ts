import { ApiError, type HarnessDesiredConfiguration } from '@smarteverything/domain';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import { Logger, background } from '@smarteverything/logging';
import type { HarnessService } from '../harness/service';
import { CommandLanes } from '../commands/lanes';

export class HubHarnessConfiguration {
  private dispatcher: HarnessDispatcher | null = null;
  private readonly reports = new CommandLanes();
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
    if (this.dispatcher !== null) this.reported(false);
  }

  pending(): void {
    this.reported(true);
  }

  private reported(pending: boolean): void {
    background(
      this.reports.run('report', () => this.report(pending)),
      'harness.configuration_report_failed',
    );
  }

  configure(configuration: HarnessDesiredConfiguration): void {
    const dispatcher = this.dispatcher;
    if (dispatcher === null) throw new ApiError('conflict', 'Hub composition is not initialized.');
    void dispatcher.runtime
      .configure(configuration)
      .then(() => {
        this.reported(dispatcher.runtime.configurationState().pendingRevision !== null);
      })
      .catch((cause: unknown) => {
        this.log.error('configuration.apply_failed', cause);
      });
  }

  async report(pending: boolean): Promise<void> {
    const dispatcher = this.dispatcher;
    if (dispatcher === null) return;
    const state = dispatcher.runtime.configurationState();
    if (state.revision === null)
      throw new ApiError('conflict', 'Hub has no applied configuration.');
    await this.service.configuration.report(
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
